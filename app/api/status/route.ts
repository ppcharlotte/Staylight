import { NextResponse } from "next/server";

export async function GET() {
  const liveQuotaConfigured = process.env.NODE_ENV !== "production" || Boolean(
    process.env.STAYLIGHT_RATE_LIMIT_SECRET
    && process.env.UPSTASH_REDIS_REST_URL
    && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  return NextResponse.json({
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    serpApiConfigured: Boolean(process.env.SERPAPI_API_KEY),
    liveQuotaConfigured,
    model: process.env.OPENAI_MODEL ?? "gpt-5.6"
  });
}
