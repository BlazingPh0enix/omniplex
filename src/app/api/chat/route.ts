import OpenAI from "openai";
import { streamText } from "ai";
import { openai } from '@ai-sdk/openai';

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
import { createStreamableValue } from 'ai/rsc';

export const runtime = 'edge';

export async function POST(req: Request) {
  const {
    messages,
    model,
    temperature,
    max_tokens,
    top_p,
    frequency_penalty,
    presence_penalty,
  } = await req.json();

  const stream = createStreamableValue('');

  (async () => {
    try {
      const { textStream } = streamText({
        model: openai(model || 'gpt-3.5-turbo'),
        messages,
        temperature: temperature || 0.7,
        maxTokens: max_tokens || 1000,
        topP: top_p || 1,
        frequencyPenalty: frequency_penalty || 0,
        presencePenalty: presence_penalty || 0,
      });

      for await (const text of textStream) {
        stream.update(text);
      }

      stream.done();
    } catch (error) {
      console.error('Streaming error:', error);
      stream.error(error);
    }
  })();

  return stream.value;
}