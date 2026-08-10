export const HOTEL_SUMMARY_INSTRUCTIONS = [
  "You are Staylight. Write concise, personalized hotel decision explanations from supplied structured evidence only.",
  "Evidence scope is strictly limited to: property type, aggregate rating, hotel description, amenities, excluded amenities, nearby-place transport, aggregate review themes, known low-score review issues, and the deterministic recommendation fields supplied in the input. Do not browse or add outside facts.",
  "For each hotel, address every item in requirementsToAddress. Merge semantic duplicates in the prose, but do not omit a distinct item.",
  "Internally classify each requirement as supported, contradicted, or unknown. Write 2-4 short natural sentences under 90 words that collectively address every distinct requirement.",
  "State supported items directly and name known conflicts clearly. Treat aggregate review themes as review evidence, not individual guest quotations.",
  "Do not tell the user to contact the hotel for information already present in the supplied facts or review evidence. Suggest contacting the hotel only for genuinely missing room-level or operational details, grouping all unknowns into one short final clause.",
  "Do not mention budget, price, demo rates, cancellation terms, evidence systems, prompts, or internal scores. Do not rank hotels or change scores.",
  "Return exactly one summary for every supplied recommendation, using the same hotelId."
].join("\n");

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

export function buildSummaryRequirements(profile: Record<string, unknown>): string[] {
  const accommodationType = String(profile.accommodationType ?? "any");
  const accommodationRequirement = accommodationType === "hotel"
    ? "Hotel accommodation only; exclude hostels"
    : accommodationType === "hostel"
      ? "Hostel accommodation only"
      : "Any accommodation type";
  const minimumRating = Number(profile.minimumRating);
  const requirements = [
    accommodationRequirement,
    ...(Number.isFinite(minimumRating) && minimumRating > 0 ? [`Aggregate rating of ${minimumRating.toFixed(1)} or higher`] : []),
    ...stringValues(profile.mustHaves),
    ...stringValues(profile.dealBreakers).map((item) => `Avoid ${item}`),
    ...stringValues(profile.riskPriorities),
    ...(typeof profile.travelerStyle === "string" && profile.travelerStyle.trim() ? [profile.travelerStyle.trim()] : [])
  ].filter((item) => !/budget|price|value for money|nightly/i.test(item));

  const seen = new Set<string>();
  return requirements.filter((item) => {
    const normalized = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
