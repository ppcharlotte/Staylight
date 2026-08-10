import type { HotelCandidate, HotelResearchProfile } from "@/lib/types";

function normalizeIdentityPart(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function canonicalHotelKey(hotel: Pick<HotelCandidate, "id" | "name" | "area">, destination: string): string {
  const name = normalizeIdentityPart(hotel.name);
  const area = normalizeIdentityPart(hotel.area || destination);
  const destinationKey = normalizeIdentityPart(destination);
  return `${name}::${area}::${destinationKey}`;
}

export function isResearchProfileFresh(profile: HotelResearchProfile, now = Date.now()): boolean {
  const expiry = Date.parse(profile.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function enrichHotelWithResearch(
  hotel: HotelCandidate,
  profile: HotelResearchProfile,
  status: HotelCandidate["researchStatus"]
): HotelCandidate {
  const aspectEvidence = profile.aspects
    .filter((aspect) => aspect.sentiment !== "unknown")
    .map((aspect) => `${aspect.name}: ${aspect.summary}`);

  return {
    ...hotel,
    reviewSnippets: unique([
      profile.summary,
      ...profile.positiveThemes,
      ...aspectEvidence,
      ...hotel.reviewSnippets
    ]).slice(0, 18),
    lowScoreReviewIssues: unique([
      ...profile.recurringIssues,
      ...(hotel.lowScoreReviewIssues ?? [])
    ]).slice(0, 10),
    researchSources: profile.sources,
    researchUpdatedAt: profile.researchedAt,
    researchStatus: status
  };
}
