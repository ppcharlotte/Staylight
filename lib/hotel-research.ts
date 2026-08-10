import { z } from "zod";
import { canonicalHotelKey } from "@/lib/hotel-profiles";
import type { HotelCandidate, HotelResearchProfile, ResearchSource } from "@/lib/types";

const aspectSchema = z.object({
  name: z.string().min(1).max(80),
  sentiment: z.enum(["positive", "negative", "mixed", "unknown"]),
  summary: z.string().min(1).max(220),
  confidence: z.enum(["high", "medium", "low"])
});

const researchResultSchema = z.object({
  summary: z.string().min(1).max(700),
  positiveThemes: z.array(z.string().min(1).max(180)).max(8),
  recurringIssues: z.array(z.string().min(1).max(180)).max(8),
  aspects: z.array(aspectSchema).max(12)
});

const researchJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", maxLength: 700 },
    positiveThemes: { type: "array", items: { type: "string", maxLength: 180 }, maxItems: 8 },
    recurringIssues: { type: "array", items: { type: "string", maxLength: 180 }, maxItems: 8 },
    aspects: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 80 },
          sentiment: { type: "string", enum: ["positive", "negative", "mixed", "unknown"] },
          summary: { type: "string", maxLength: 220 },
          confidence: { type: "string", enum: ["high", "medium", "low"] }
        },
        required: ["name", "sentiment", "summary", "confidence"],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "positiveThemes", "recurringIssues", "aspects"],
  additionalProperties: false
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function truncateText(value: unknown, maximum: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum - 3).trimEnd()}...`;
}

function normalizeResearchResult(value: unknown): unknown {
  const result = asRecord(value);
  const normalizeList = (items: unknown, maximum: number, limit: number) => (
    Array.isArray(items)
      ? items.map((item) => truncateText(item, maximum)).filter(Boolean).slice(0, limit)
      : []
  );
  const aspects = Array.isArray(result.aspects)
    ? result.aspects.slice(0, 12).map((rawAspect) => {
      const aspect = asRecord(rawAspect);
      return {
        name: truncateText(aspect.name, 80),
        sentiment: aspect.sentiment,
        summary: truncateText(aspect.summary, 220),
        confidence: aspect.confidence
      };
    })
    : [];

  return {
    summary: truncateText(result.summary, 700),
    positiveThemes: normalizeList(result.positiveThemes, 180, 8),
    recurringIssues: normalizeList(result.recurringIssues, 180, 8),
    aspects
  };
}

type ResponseOutputItem = {
  action?: { sources?: Array<{ title?: string; url?: string }> };
  content?: Array<{
    annotations?: Array<{ title?: string; type?: string; url?: string }>;
    text?: string;
    type?: string;
  }>;
};

function validWebSource(title: string | undefined, url: string | undefined): ResearchSource | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return { title: title?.trim() || parsed.hostname, url: parsed.toString() };
  } catch {
    return null;
  }
}

function collectSources(output: ResponseOutputItem[]): ResearchSource[] {
  const sources = new Map<string, ResearchSource>();
  for (const item of output) {
    for (const rawSource of item.action?.sources ?? []) {
      const source = validWebSource(rawSource.title, rawSource.url);
      if (source) sources.set(source.url, source);
    }
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type !== "url_citation") continue;
        const source = validWebSource(annotation.title, annotation.url);
        if (source) sources.set(source.url, source);
      }
    }
  }
  return [...sources.values()].slice(0, 8);
}

function extractOutputText(payload: { output?: ResponseOutputItem[]; output_text?: string }): string {
  if (typeof payload.output_text === "string" && payload.output_text) return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("");
}

function cacheDurationDays(): number {
  const configured = Number(process.env.STAYLIGHT_RESEARCH_TTL_DAYS ?? 30);
  return Number.isFinite(configured) ? Math.min(90, Math.max(1, configured)) : 30;
}

export async function researchHotelProfile(hotel: HotelCandidate, destination: string): Promise<HotelResearchProfile> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for hotel research.");

  const model = process.env.OPENAI_MODEL ?? "gpt-5.6";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", search_context_size: "low" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      instructions: [
        "Build a reusable evidence profile for one exact hotel from current public web sources.",
        "Confirm the hotel name and location before using a source. Do not combine similarly named properties.",
        "Prioritize recent traveler-review evidence and the official hotel site. Identify repeated patterns, not isolated anecdotes.",
        "Cover quietness, cleanliness, location, room size, service, accessibility, Wi-Fi, breakfast, and recurring low-review problems when evidence exists.",
        "Always identify shared bathrooms or shared toilets when sources mention them; never describe them as private or merely unknown.",
        "Positive themes must be evidence statements. Recurring issues must come from negative or low-review patterns, not generic cautions.",
        "Use unknown and low confidence when public evidence is sparse or conflicting. Do not mention prices and do not invent facts.",
        "Do not claim access to a platform's complete review corpus. Keep every item concise and reusable across travelers."
      ].join("\n"),
      input: JSON.stringify({
        hotel: {
          id: hotel.id,
          name: hotel.name,
          area: hotel.area,
          destination,
          officialSource: hotel.sourceUrl ?? null
        },
        existingEvidence: {
          amenities: hotel.amenities,
          locationNotes: hotel.locationNotes,
          reviewThemes: hotel.reviewSnippets,
          knownLowScoreIssues: hotel.lowScoreReviewIssues ?? []
        }
      }),
      text: {
        format: {
          type: "json_schema",
          name: "staylight_hotel_research_profile",
          description: "Reusable, sourced hotel review profile.",
          strict: true,
          schema: researchJsonSchema
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" ? message : `OpenAI hotel research returned ${response.status}.`);
  }

  const result = researchResultSchema.parse(normalizeResearchResult(JSON.parse(extractOutputText(payload))));
  const researchedAt = new Date();
  const expiresAt = new Date(researchedAt.getTime() + cacheDurationDays() * 24 * 60 * 60 * 1000);
  return {
    key: canonicalHotelKey(hotel, destination),
    hotelId: hotel.id,
    hotelName: hotel.name,
    area: hotel.area,
    destination,
    ...result,
    sources: collectSources(Array.isArray(payload.output) ? payload.output : []),
    researchedAt: researchedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    model
  };
}
