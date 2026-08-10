import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { demoProfile, sampleHotels } from "@/lib/sample-data";
import { buildSummaryRequirements, HOTEL_SUMMARY_INSTRUCTIONS } from "@/lib/prompts";
import { buildFallbackDetailSummary, rankHotelsByRules } from "@/lib/rule-engine";
import type { HotelCandidate, TravelerProfile } from "@/lib/types";

const summarySchema = z.object({
  hotelId: z.string(),
  detailSummary: z.string().min(1).max(700)
});

const summaryPayloadSchema = z.object({
  summaries: z.array(summarySchema).min(1)
});

const summaryJsonSchema = {
  type: "object",
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hotelId: { type: "string" },
          detailSummary: { type: "string" }
        },
        required: ["hotelId", "detailSummary"],
        additionalProperties: false
      }
    }
  },
  required: ["summaries"],
  additionalProperties: false
} as const;

const analyzeSchema = z.object({
  profile: z.record(z.unknown()).default(demoProfile),
  hotels: z.array(z.record(z.unknown())).default(sampleHotels)
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function buildFallbackRecommendations(hotels: Record<string, unknown>[], profile: Record<string, unknown>) {
  const completeHotels = hotels.filter((hotel) => (
    typeof hotel.id === "string"
    && typeof hotel.name === "string"
    && Array.isArray(hotel.amenities)
    && Array.isArray(hotel.locationNotes)
    && Array.isArray(hotel.reviewSnippets)
  ));
  if (completeHotels.length === hotels.length) {
    return rankHotelsByRules(completeHotels as unknown as HotelCandidate[], profile as Partial<TravelerProfile>);
  }

  return hotels.map((rawHotel, index) => {
    const hotel = asRecord(rawHotel);
    const id = String(hotel.id ?? `hotel-${index + 1}`);
    const name = String(hotel.name ?? `Hotel ${index + 1}`);
    const amenities = asStringArray(hotel.amenities);
    const reviewSnippets = asStringArray(hotel.reviewSnippets);
    const locationNotes = asStringArray(hotel.locationNotes);
    const evidence = [...reviewSnippets, ...locationNotes].slice(0, 3);

    const fitLabel = index === 0 ? "Best available fit" : "Worth comparing";
    const whyItFits = amenities.length > 0 ? amenities.slice(0, 3) : ["Available for the requested destination"];
    const verifyBeforeBooking = ["Room size and layout", "Noise exposure", "Cancellation policy"];
    return {
      hotelId: id,
      hotelName: name,
      fitScore: Math.max(62, 86 - index * 6),
      fitLabel,
      whyItFits,
      risks: ["Live review evidence is limited; verify the room and cancellation terms."],
      reviewLens: {
        positiveThemes: amenities.length > 0 ? amenities.slice(0, 3) : ["Location availability"],
        negativeThemes: [],
        travelerSpecificFlags: ["Quiet-room placement: verify before booking", "Late arrival: verify before booking"],
        evidenceNotes: evidence.length > 0 ? evidence : ["The hotel source returned limited evidence."],
        confidence: evidence.length > 1 ? ("medium" as const) : ("low" as const)
      },
      verifyBeforeBooking,
      detailSummary: buildFallbackDetailSummary(fitLabel, whyItFits, verifyBeforeBooking, ["Live review evidence is limited"])
    };
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = analyzeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid analysis request." }, { status: 400 });
  }

  const deterministicRecommendations = buildFallbackRecommendations(parsed.data.hotels, parsed.data.profile);

  if (deterministicRecommendations.length === 0) {
    return NextResponse.json({ recommendations: [], source: "rules" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      recommendations: deterministicRecommendations,
      source: "sample",
      limitations: ["OPENAI_API_KEY is missing, so Staylight returned bundled recommendation analysis."]
    });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL ?? "gpt-5.6";
    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: HOTEL_SUMMARY_INSTRUCTIONS,
      input: JSON.stringify({
        profile: parsed.data.profile,
        requirementsToAddress: buildSummaryRequirements(parsed.data.profile),
        hotels: parsed.data.hotels,
        recommendations: deterministicRecommendations
      }),
      text: {
        format: {
          type: "json_schema",
          name: "staylight_hotel_summaries",
          description: "Concise personalized hotel detail summaries grounded in supplied evidence.",
          strict: true,
          schema: summaryJsonSchema
        }
      }
    });

    const validated = summaryPayloadSchema.safeParse(JSON.parse(response.output_text));

    if (!validated.success) {
      throw new Error("OpenAI returned an invalid hotel summary shape.");
    }

    const summariesByHotel = new Map(validated.data.summaries.map((item) => [item.hotelId, item.detailSummary]));
    const recommendations = deterministicRecommendations.map((recommendation) => ({
      ...recommendation,
      detailSummary: summariesByHotel.get(recommendation.hotelId) ?? recommendation.detailSummary
    }));

    return NextResponse.json({ recommendations, source: "openai", model });
  } catch (error) {
    return NextResponse.json({
      recommendations: deterministicRecommendations,
      source: "fallback",
      limitations: [error instanceof Error ? error.message : "AI analysis failed."]
    });
  }
}
