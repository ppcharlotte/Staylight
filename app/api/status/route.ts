import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    serpApiConfigured: Boolean(process.env.SERPAPI_API_KEY),
    model: process.env.OPENAI_MODEL ?? "gpt-5.6"
  });
}
