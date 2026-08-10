type EvidenceRecord = Record<string, unknown>;

function asRecord(value: unknown): EvidenceRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as EvidenceRecord : {};
}

function stringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function extractLiveHotelEvidence(property: EvidenceRecord, destination: string) {
  const amenities = stringArray(property.amenities, 14);
  const excludedAmenities = stringArray(property.excluded_amenities, 10);
  const essentialInfo = stringArray(property.essential_info, 8);
  const description = typeof property.description === "string" ? property.description.trim() : "";

  const nearbyPlaces = Array.isArray(property.nearby_places)
    ? property.nearby_places.slice(0, 6).map((rawPlace) => {
      const place = asRecord(rawPlace);
      const name = String(place.name ?? "").trim();
      const transport = Array.isArray(place.transportations)
        ? place.transportations.slice(0, 2).map((rawTransport) => {
          const item = asRecord(rawTransport);
          return [item.type, item.duration].map(String).filter((value) => value && value !== "undefined").join(" ");
        }).filter(Boolean)
        : [];
      return [name, transport.join(" or ")].filter(Boolean).join(": ");
    }).filter(Boolean)
    : [];

  const reviewThemes = Array.isArray(property.reviews_breakdown)
    ? property.reviews_breakdown.map((rawTheme) => {
      const theme = asRecord(rawTheme);
      return {
        name: String(theme.name ?? "Review theme").trim(),
        description: String(theme.description ?? "").trim(),
        positive: numberValue(theme.positive),
        negative: numberValue(theme.negative),
        neutral: numberValue(theme.neutral),
        total: numberValue(theme.total_mentioned)
      };
    }).filter((theme) => theme.name)
    : [];

  const reviewSnippets = [...reviewThemes]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((theme) => {
      const counts = `${theme.positive} positive, ${theme.negative} negative mentions`;
      return `${theme.name}: ${theme.description || counts}${theme.description ? ` (${counts})` : ""}`;
    });
  const lowScoreReviewIssues = [...reviewThemes]
    .filter((theme) => theme.negative > 0 && theme.negative >= theme.positive)
    .sort((a, b) => b.negative - a.negative)
    .slice(0, 4)
    .map((theme) => theme.description ? `${theme.name}: ${theme.description}` : theme.name);

  return {
    amenities: [...new Set([...amenities, ...essentialInfo])],
    excludedAmenities,
    locationNotes: [description, ...nearbyPlaces].filter(Boolean).slice(0, 8),
    reviewSnippets,
    lowScoreReviewIssues,
    areaFallback: destination
  };
}
