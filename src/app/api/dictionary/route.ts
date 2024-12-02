import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const word = searchParams.get("word");

  if (!word) {
    return new NextResponse(JSON.stringify({ error: "Word is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Split compound words and try to get definition for the main word
  const words = word.split(" ");
  const mainWord = words[0];  // Get the first word
  const apiUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${mainWord}`;

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      return new NextResponse(
        JSON.stringify({ 
          error: "No definition found", 
          message: `Could not find definition for "${word}". Tried looking up "${mainWord}"` 
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return new NextResponse(JSON.stringify({ error: "Word not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const dictionaryData = data[0];

    const structuredData = {
      word: dictionaryData.word,
      phonetic: dictionaryData.phonetic,
      phonetics: dictionaryData.phonetics,
      origin: dictionaryData.origin,
      meanings: dictionaryData.meanings.map((meaning: any) => ({
        partOfSpeech: meaning.partOfSpeech,
        definitions: meaning.definitions.map((definition: any) => ({
          definition: definition.definition,
          example: definition.example,
        })),
      })),
    };

    return new NextResponse(JSON.stringify(structuredData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new NextResponse(
      JSON.stringify({ error: "An error occurred while fetching definitions" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
