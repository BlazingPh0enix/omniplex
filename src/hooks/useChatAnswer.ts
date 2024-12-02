import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  updateAnswer,
  addMessage,
  updateMessage,
  selectChatThread,
} from "@/store/chatSlice";
import { Chat as ChatType, ChatThread, Message } from "../utils/types";
import { getInitialMessages } from "../utils/utils";
import { selectUserDetailsState } from "@/store/authSlice";
import { selectAI } from "@/store/aiSlice";
import { store } from "@/store/store";
import { doc, updateDoc } from "@firebase/firestore";
import { db } from "../../firebaseConfig";
import { readStreamableValue } from 'ai/rsc';

type UseChatAnswerProps = {
  threadId: string;
  chatThread: ChatThread;
  setError: (error: string) => void;
  setErrorFunction: (fn: Function | null) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsCompleted: (isCompleted: boolean) => void;
  model?: string;
  temperature?: number;
  maxLength?: number;
  topP?: number;
  frequency?: number;
  presence?: number;
};

const useChatAnswer = ({
  threadId,
  chatThread,
  setError,
  setErrorFunction,
  setIsStreaming,
  setIsLoading,
  setIsCompleted,
  model,
  temperature,
  maxLength,
  topP,
  frequency,
  presence,
}: UseChatAnswerProps) => {
  const dispatch = useDispatch();
  const userDetails = useSelector(selectUserDetailsState);
  const ai = useSelector(selectAI);
  const userId = userDetails.uid;

  const [controller, setController] = useState<AbortController | null>(null);

  const handleSave = async () => {
    if (userId) {
      try {
        const updatedState = store.getState();
        const updatedChatThread = selectChatThread(updatedState, threadId);
        const updatedChats = updatedChatThread?.chats || [];
        const updatedMessages = updatedChatThread?.messages || [];
        if (userId) {
          try {
            const chatThreadRef = doc(db, "users", userId, "history", threadId);
            await updateDoc(chatThreadRef, {
              messages: updatedMessages,
              chats: updatedChats,
            });
          } catch (error) {
            console.error("Error updating chat thread in Firestore:", error);
          }
        }
      } catch (error) {
        console.error("Error updating Firestore DB:", error);
      }
    }
  };

  const handleAnswer = async (chat: ChatType, data?: string) => {
    try {
      setIsLoading(true);
      setIsStreaming(true);
      setIsCompleted(false);

      const messages = getInitialMessages(chat, data);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          model: ai.model,
          temperature: temperature || ai.temperature,
          max_tokens: maxLength || ai.maxLength,
          top_p: topP || ai.topP,
          frequency_penalty: frequency || ai.frequency,
          presence_penalty: presence || ai.presence,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        if (!reader) break;
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        // Dispatch update with accumulated text
        dispatch(
          updateAnswer({
            threadId,
            chatIndex: chatThread.chats.length - 1,
            answer: accumulatedText,
          })
        );
      }

      setIsStreaming(false);
      setIsCompleted(true);
      setIsLoading(false);

      // Optional: Save to Firestore if user is logged in
      const userDetails = selectUserDetailsState(store.getState());
      if (userDetails?.uid) {
        const threadRef = doc(db, "users", userDetails.uid, "history", threadId);
        await updateDoc(threadRef, {
          [`chats.${chatThread.chats.length - 1}.answer`]: accumulatedText,
        });
      }
    } catch (error) {
      console.error("Error in handleAnswer:", error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : 'An unknown error occurred';
      setError(`Failed to get response: ${errorMessage}`);
      setIsStreaming(false);
      setIsLoading(false);
      setErrorFunction(() => () => handleAnswer(chat, data));
    }
  };

  const handleRewrite = async () => {
    setIsLoading(true);
    setIsCompleted(false);
    const newController = new AbortController();
    setController(newController);

    const lastChat = chatThread.chats[chatThread.chats.length - 1];
    const lastUserMessage = chatThread.messages.findLast(
      (message) => message.role === "user"
    );

    if (!lastChat.answer) {
      return;
    }

    const messages: Message[] = [];
    const systemMessage = chatThread.messages.find(
      (message) => message.role === "system"
    );
    if (systemMessage) {
      messages.push(systemMessage);
    }
    chatThread.chats.slice(0, -1).forEach((prevChat) => {
      messages.push({ role: "user", content: prevChat.question });
      if (prevChat.answer) {
        messages.push({ role: "assistant", content: prevChat.answer });
      }
    });

    messages.push({
      role: "user",
      content: lastUserMessage?.content ?? lastChat.question,
    });

    if (ai.customPrompt.length > 0) {
      messages.splice(messages.length - 1, 0, {
        role: "system",
        content: ai.customPrompt,
      });
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model: lastChat.mode === "image" ? "gpt-4o" : model || ai.model,
          temperature: temperature || ai.temperature,
          max_tokens: maxLength || ai.maxLength,
          top_p: topP || ai.topP,
          frequency_penalty: frequency || ai.frequency,
          presence_penalty: presence || ai.presence,
        }),
        signal: newController.signal,
      });

      if (!response.ok) {
        setError("Something went wrong. Please try again later.");
        setErrorFunction(() => handleRewrite);
        return;
      }

      setIsLoading(false);
      if (response.body) {
        setError("");
        setIsStreaming(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        while (true) {
          const { value, done } = await reader.read();
          const text = decoder.decode(value);
          answer += text;
          dispatch(
            updateAnswer({
              threadId,
              chatIndex: chatThread.chats.length - 1,
              answer: answer,
            })
          );
          if (done) {
            break;
          }
        }
        const lastAssistantMessageIndex = chatThread.messages.findLastIndex(
          (message) => message.role === "assistant"
        );

        if (lastAssistantMessageIndex !== -1) {
          dispatch(
            updateMessage({
              threadId,
              messageIndex: lastAssistantMessageIndex,
              message: { role: "assistant", content: answer },
            })
          );
        }
        setIsStreaming(false);
        setIsCompleted(true);
        handleSave();
      }
    } catch (error) {
      setIsLoading(false);
      setIsStreaming(false);
      setIsCompleted(true);
      if ((error as Error).name === "AbortError") {
        await handleSave();
        return;
      }
      setError("Something went wrong. Please try again later.");
      setErrorFunction(() => handleRewrite);
    } finally {
      setController(null);
    }
  };

  const handleCancel = () => {
    if (controller) {
      controller.abort();
      setIsStreaming(false);
    }
  };

  return {
    handleAnswer,
    handleRewrite,
    handleCancel,
  };
};

export default useChatAnswer;
