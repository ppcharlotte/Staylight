import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { demoProfile } from "@/lib/sample-data";
import { applyPreferences, defaultUserPreferences } from "@/lib/preferences";
import { extractRequirementPriorities, isExplicitInterviewFinish, isNoMoreAnswer } from "@/lib/requirements";
import { formatBudget, formatDateRange } from "@/lib/trip";
import type { TravelerProfile } from "@/lib/types";

const FINAL_CHECK_QUESTION =
  "I have your requirements for this trip. Is there anything else you want to add before I use them?";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1)
});

const travelerProfileSchema = z.object({
  destination: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number().int().positive(),
  rooms: z.number().int().positive(),
  dates: z.string(),
  party: z.string(),
  budgetMin: z.number(),
  budgetMax: z.number(),
  budget: z.string(),
  accommodationType: z.enum(["hotel", "hostel", "any"]).default("hotel"),
  minimumRating: z.number().min(0).max(5).default(4),
  mustHaves: z.array(z.string()),
  dealBreakers: z.array(z.string()),
  travelerStyle: z.string(),
  riskPriorities: z.array(z.string())
});

const profileRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  tripBasics: z.object({
    destination: z.string().min(1),
    checkIn: z.string().min(1),
    checkOut: z.string().min(1),
    adults: z.number().int().positive(),
    rooms: z.number().int().positive(),
    budgetMin: z.number().min(0),
    budgetMax: z.number().min(0),
    accommodationType: z.enum(["hotel", "hostel", "any"]).default("hotel"),
    minimumRating: z.number().min(0).max(5).default(4)
  }),
  preferences: z.object({
    valueForMoney: z.number().min(1).max(5),
    reviewScore: z.number().min(1).max(5),
    quiet: z.number().min(1).max(5),
    location: z.number().min(1).max(5),
    notes: z.string(),
    customPriorities: z.array(z.object({ label: z.string().min(1), score: z.number().min(1).max(5) }))
  }).default(defaultUserPreferences),
  currentProfile: travelerProfileSchema.nullable().optional(),
  phase: z.enum(["collecting", "final_check", "confirmed"]).default("collecting"),
  mode: z.enum(["sample", "live"]).default("sample"),
  finishRequested: z.boolean().default(false)
});

const modelResponseSchema = z.object({
  profile: travelerProfileSchema,
  assistantMessage: z.string().min(1),
  phase: z.enum(["collecting", "final_check", "confirmed"]),
  readyForSearch: z.boolean()
});

const profileJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        destination: { type: "string" },
        checkIn: { type: "string" },
        checkOut: { type: "string" },
        adults: { type: "number" },
        rooms: { type: "number" },
        dates: { type: "string" },
        party: { type: "string" },
        budgetMin: { type: "number" },
        budgetMax: { type: "number" },
        budget: { type: "string" },
        accommodationType: { type: "string", enum: ["hotel", "hostel", "any"] },
        minimumRating: { type: "number" },
        mustHaves: { type: "array", items: { type: "string" } },
        dealBreakers: { type: "array", items: { type: "string" } },
        travelerStyle: { type: "string" },
        riskPriorities: { type: "array", items: { type: "string" } }
      },
      required: [
        "destination",
        "checkIn",
        "checkOut",
        "adults",
        "rooms",
        "dates",
        "party",
        "budgetMin",
        "budgetMax",
        "budget",
        "accommodationType",
        "minimumRating",
        "mustHaves",
        "dealBreakers",
        "travelerStyle",
        "riskPriorities"
      ]
    },
    assistantMessage: { type: "string" },
    phase: { type: "string", enum: ["collecting", "final_check", "confirmed"] },
    readyForSearch: { type: "boolean" }
  },
  required: ["profile", "assistantMessage", "phase", "readyForSearch"]
} as const;

function inferSampleProfile(
  messages: z.infer<typeof chatMessageSchema>[],
  tripBasics: z.infer<typeof profileRequestSchema>["tripBasics"],
  preferences: z.infer<typeof profileRequestSchema>["preferences"],
  currentProfile?: TravelerProfile | null
) {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");
  const lower = userText.toLowerCase();
  const mustHaves = new Set(currentProfile?.mustHaves ?? []);
  const dealBreakers = new Set(currentProfile?.dealBreakers ?? []);
  const riskPriorities = new Set(currentProfile?.riskPriorities ?? []);
  let party = currentProfile?.party ?? "";

  if (/solo|myself|一个人|独自/.test(lower)) party = "Solo traveler";
  if (/couple|partner|two of us|two people|情侣|两个人/.test(lower)) party = "Couple";
  if (/family|child|children|孩子|家庭/.test(lower)) party = "Family";

  const extractedPriorities = extractRequirementPriorities(userText);
  extractedPriorities.forEach((priority) => {
    riskPriorities.add(priority);
  });
  if (extractedPriorities.includes("Avoid hostels")) dealBreakers.add("Hostel");

  if (/quiet|silent|light sleeper|安静|睡眠/.test(lower)) {
    mustHaves.add("Quiet room");
    riskPriorities.add("Noise");
  }
  if (/cleanliness|cleaness|cleaniness|clean room|dirty|unclean|hygiene|spotless|干净|卫生|脏/.test(lower)) {
    mustHaves.add("Clean room");
    riskPriorities.add("Cleanliness");
  }
  if (/wifi|wi-fi|internet|网络/.test(lower)) {
    mustHaves.add("Reliable Wi-Fi");
    riskPriorities.add("Reliable Wi-Fi");
  }
  if (/transit|station|metro|train|地铁|交通/.test(lower)) {
    mustHaves.add("Near transit");
    riskPriorities.add("Commute friction");
  }
  if (/safe|safety|late arrival|安全|夜间/.test(lower)) {
    mustHaves.add("Safe late arrival");
    riskPriorities.add("Late-night safety");
  }
  if (/party|nightlife|club|派对|夜店/.test(lower)) {
    dealBreakers.add("Party street");
    riskPriorities.add("Avoid nightlife streets");
  }
  if (/tiny|small room|room size|房间小/.test(lower)) {
    dealBreakers.add("Tiny room with no desk");
    riskPriorities.add("Room size");
  }
  if (/desk|workspace|work desk|书桌|办公/.test(lower)) {
    mustHaves.add("Work desk");
    riskPriorities.add("Work desk");
  }
  if (/private bathroom|private toilet|en-?suite|own bathroom|独立卫生间|私人浴室|独立卫浴/.test(lower)) {
    mustHaves.add("Private bathroom");
    dealBreakers.add("Shared bathroom");
    riskPriorities.add("Private bathroom");
  }
  if (/bathtub|bath tub|浴缸/.test(lower)) {
    mustHaves.add("Bathtub");
    riskPriorities.add("Bathtub");
  }
  if (/step-free|wheelchair|accessible|无障碍/.test(lower)) {
    mustHaves.add("Step-free access");
    riskPriorities.add("Step-free access");
  }
  if (/gym|fitness|健身/.test(lower)) {
    mustHaves.add("Fitness facilities");
    riskPriorities.add("Fitness facilities");
  }
  if (/breakfast|早餐/.test(lower)) {
    mustHaves.add("Breakfast");
    riskPriorities.add("Breakfast");
  }
  if (/laundry|washing machine|洗衣/.test(lower)) {
    mustHaves.add("Laundry");
    riskPriorities.add("Laundry");
  }
  if (/balcony|terrace|阳台|露台/.test(lower)) {
    mustHaves.add("Balcony");
    riskPriorities.add("Balcony");
  }
  if (/city cent(?:er|re)|downtown|central location|市中心/.test(lower)) {
    mustHaves.add("Central location");
    riskPriorities.add("Central location");
  }

  return applyPreferences({
    ...demoProfile,
    ...currentProfile,
    ...tripBasics,
    dates: formatDateRange(tripBasics.checkIn, tripBasics.checkOut),
    budget: formatBudget(tripBasics.budgetMin, tripBasics.budgetMax),
    party: party || demoProfile.party,
    travelerStyle: preferences.notes.trim() || currentProfile?.travelerStyle || demoProfile.travelerStyle,
    mustHaves: mustHaves.size > 0 ? [...mustHaves] : currentProfile ? [] : demoProfile.mustHaves,
    dealBreakers: dealBreakers.size > 0 ? [...dealBreakers] : currentProfile ? [] : demoProfile.dealBreakers,
    riskPriorities: riskPriorities.size > 0 ? [...riskPriorities] : currentProfile ? [] : demoProfile.riskPriorities
  }, preferences);
}

function sampleTransition(
  data: z.infer<typeof profileRequestSchema>,
  source: "sample" | "fallback" | "openai" = "sample"
) {
  const userMessages = data.messages.filter((message) => message.role === "user");
  const latestAnswer = userMessages.at(-1)?.content ?? "";
  const profile = inferSampleProfile(data.messages, data.tripBasics, data.preferences, data.currentProfile);

  if (data.phase === "final_check") {
    if (isNoMoreAnswer(latestAnswer)) {
      return {
        profile,
        assistantMessage:
          "Got it. I'll use these requirements to rank hotel fit, risks, and review confidence.",
        phase: "confirmed" as const,
        readyForSearch: true,
        source
      };
    }

    return {
      profile,
      assistantMessage: `Thanks, I've added that. ${FINAL_CHECK_QUESTION}`,
      phase: "final_check" as const,
      readyForSearch: false,
      source
    };
  }

  if (userMessages.length === 1) {
    return {
      profile,
      assistantMessage: "Is there anything else specific to this stay, such as room setup, accessibility, work needs, or a deal-breaker that differs from your usual preferences?",
      phase: "collecting" as const,
      readyForSearch: false,
      source
    };
  }

  if (userMessages.length === 2) {
    return {
      profile,
      assistantMessage: FINAL_CHECK_QUESTION,
      phase: "final_check" as const,
      readyForSearch: false,
      source
    };
  }

  return {
    profile,
    assistantMessage: FINAL_CHECK_QUESTION,
    phase: "final_check" as const,
    readyForSearch: false,
    source
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = profileRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile request." }, { status: 400 });
  }

  const latestUserAnswer = [...parsed.data.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const explicitlyFinished = parsed.data.finishRequested || isExplicitInterviewFinish(latestUserAnswer);

  if (explicitlyFinished || (parsed.data.phase === "final_check" && isNoMoreAnswer(latestUserAnswer))) {
    const completionData = { ...parsed.data, phase: "final_check" as const };
    return NextResponse.json(sampleTransition(completionData, parsed.data.mode === "live" && process.env.OPENAI_API_KEY ? "openai" : "sample"));
  }

  if (parsed.data.mode === "sample") {
    return NextResponse.json(sampleTransition(parsed.data));
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: "Live interview requires OPENAI_API_KEY. Switch to Sample or add the key server-side."
    }, { status: 503 });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL ?? "gpt-5.6";
    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: [
        "You are Staylight, a concise hotel decision advisor conducting a multi-turn traveler interview.",
        "Ask exactly one useful question at a time. Collect only requirements specific to this trip: party, temporary must-haves, deal-breakers, and unusual risks.",
        "Treat explicit exclusions, refusals, and 'must not' statements as dealBreakers. Preserve them exactly enough for deterministic filtering and never relax them.",
        `The user's persistent hotel preferences are already known; apply them without asking again: ${JSON.stringify(parsed.data.preferences)}.`,
        `The user directly entered these immutable trip facts; never ask for or change them: ${JSON.stringify(parsed.data.tripBasics)}.`,
        `Current phase: ${parsed.data.phase}. Current draft profile: ${JSON.stringify(parsed.data.currentProfile ?? {})}.`,
        `When enough information exists, set phase to final_check and ask exactly: ${FINAL_CHECK_QUESTION}`,
        "Never set phase to confirmed or readyForSearch to true. The server performs confirmation only after an explicit no-more answer.",
        "Keep assistantMessage under 45 words. Use empty strings or arrays for profile fields not yet known."
      ].join("\n"),
      input: parsed.data.messages,
      text: {
        format: {
          type: "json_schema",
          name: "staylight_interview",
          description: "The next Staylight interview turn and current structured traveler profile.",
          strict: true,
          schema: profileJsonSchema
        }
      }
    });

    const validated = modelResponseSchema.safeParse(JSON.parse(response.output_text));
    if (!validated.success) throw new Error("OpenAI returned an invalid interview response.");

    const nextPhase = parsed.data.phase === "final_check" || validated.data.phase !== "collecting" ? "final_check" : "collecting";

    const deterministicProfile = applyPreferences({
      ...validated.data.profile,
      ...parsed.data.tripBasics,
      dates: formatDateRange(parsed.data.tripBasics.checkIn, parsed.data.tripBasics.checkOut),
      budget: formatBudget(parsed.data.tripBasics.budgetMin, parsed.data.tripBasics.budgetMax)
    }, parsed.data.preferences);

    return NextResponse.json({
      ...validated.data,
      profile: deterministicProfile,
      assistantMessage: nextPhase === "final_check" ? FINAL_CHECK_QUESTION : validated.data.assistantMessage,
      phase: nextPhase,
      readyForSearch: false,
      source: "openai",
      model
    });
  } catch (error) {
    return NextResponse.json({
      ...sampleTransition(parsed.data, "fallback"),
      limitation: error instanceof Error ? error.message : "Live interview failed."
    });
  }
}
