import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoredHotelProfiles, upsertStoredHotelProfiles } from "@/lib/hotel-profile-store";
import { enrichHotelWithResearch, canonicalHotelKey, isResearchProfileFresh } from "@/lib/hotel-profiles";
import { researchHotelProfile } from "@/lib/hotel-research";
import type { HotelCandidate, HotelResearchProfile } from "@/lib/types";

export const runtime = "nodejs";

const hotelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  area: z.string().default(""),
  amenities: z.array(z.string()).default([]),
  locationNotes: z.array(z.string()).default([]),
  reviewSnippets: z.array(z.string()).default([]),
  lowScoreReviewIssues: z.array(z.string()).optional()
}).passthrough();

const requestSchema = z.object({
  destination: z.string().min(1),
  hotels: z.array(hotelSchema).min(1).max(24)
});

async function researchWithConcurrency(
  hotels: HotelCandidate[],
  destination: string,
  concurrency: number
): Promise<Array<{ hotel: HotelCandidate; profile?: HotelResearchProfile; error?: string }>> {
  const results: Array<{ hotel: HotelCandidate; profile?: HotelResearchProfile; error?: string }> = new Array(hotels.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < hotels.length) {
      const index = nextIndex++;
      const hotel = hotels[index];
      try {
        results[index] = { hotel, profile: await researchHotelProfile(hotel, destination) };
      } catch (error) {
        results[index] = {
          hotel,
          error: error instanceof Error ? error.message : "Hotel research failed."
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, hotels.length) }, () => worker()));
  return results;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid batch research request." }, { status: 400 });

  const destination = parsed.data.destination;
  const hotels = parsed.data.hotels as unknown as HotelCandidate[];
  const keys = hotels.map((hotel) => canonicalHotelKey(hotel, destination));
  const storedProfiles = await getStoredHotelProfiles(keys);
  const profiles = new Map<string, HotelResearchProfile>();
  const missingHotels: HotelCandidate[] = [];
  let cachedCount = 0;
  let staleCount = 0;

  for (const hotel of hotels) {
    const key = canonicalHotelKey(hotel, destination);
    const stored = storedProfiles.get(key);
    if (stored && isResearchProfileFresh(stored)) {
      profiles.set(key, stored);
      cachedCount += 1;
    } else {
      if (stored) {
        profiles.set(key, stored);
        staleCount += 1;
      }
      missingHotels.push(hotel);
    }
  }

  let researchedCount = 0;
  const researchedKeys = new Set<string>();
  const errors: string[] = [];
  if (process.env.OPENAI_API_KEY && missingHotels.length > 0) {
    const concurrency = Math.min(4, Math.max(1, Number(process.env.STAYLIGHT_RESEARCH_CONCURRENCY ?? 3) || 3));
    const researchResults = await researchWithConcurrency(missingHotels, destination, concurrency);
    const completed = researchResults.flatMap((result) => result.profile ? [result.profile] : []);
    for (const profile of completed) {
      profiles.set(profile.key, profile);
      researchedKeys.add(profile.key);
    }
    researchedCount = completed.length;
    errors.push(...researchResults.flatMap((result) => result.error ? [`${result.hotel.name}: ${result.error}`] : []));
    await upsertStoredHotelProfiles(completed);
  }

  const enrichedHotels = hotels.map((hotel) => {
    const key = canonicalHotelKey(hotel, destination);
    const profile = profiles.get(key);
    if (!profile) return { ...hotel, researchStatus: "unavailable" as const };
    const status = isResearchProfileFresh(profile)
      ? researchedKeys.has(key) ? "fresh" as const : "cached" as const
      : "stale" as const;
    return enrichHotelWithResearch(hotel, profile, status);
  });

  return NextResponse.json({
    hotels: enrichedHotels,
    research: {
      total: hotels.length,
      researched: researchedCount,
      cached: cachedCount,
      stale: staleCount,
      unavailable: enrichedHotels.filter((hotel) => hotel.researchStatus === "unavailable").length
    },
    limitations: errors.slice(0, 4)
  });
}
