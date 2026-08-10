import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHotelKey, enrichHotelWithResearch, isResearchProfileFresh } from "../lib/hotel-profiles";
import type { HotelCandidate, HotelResearchProfile } from "../lib/types";

const hotel: HotelCandidate = {
  id: "platform-token",
  name: "Hotel du Test",
  area: "City Centre",
  rating: 4.5,
  reviewCount: 200,
  price: "$180",
  nights: 2,
  providers: ["Provider"],
  amenities: ["Wi-Fi"],
  imageUrl: "https://example.com/hotel.jpg",
  locationNotes: [],
  reviewSnippets: ["Existing review theme"]
};

test("canonical hotel identity is stable across platform IDs", () => {
  assert.equal(
    canonicalHotelKey(hotel, "Paris"),
    canonicalHotelKey({ ...hotel, id: "another-platform-id" }, "Paris")
  );
});

test("research freshness uses the stored expiry", () => {
  const base = Date.parse("2026-07-31T00:00:00.000Z");
  const profile = { expiresAt: "2026-08-30T00:00:00.000Z" } as HotelResearchProfile;
  assert.equal(isResearchProfileFresh(profile, base), true);
  assert.equal(isResearchProfileFresh(profile, Date.parse("2026-09-01T00:00:00.000Z")), false);
});

test("cached research enriches reusable review evidence and sources", () => {
  const profile: HotelResearchProfile = {
    key: canonicalHotelKey(hotel, "Paris"),
    hotelId: hotel.id,
    hotelName: hotel.name,
    area: hotel.area,
    destination: "Paris",
    summary: "Recent sources consistently describe a quiet central stay.",
    positiveThemes: ["Quiet courtyard rooms"],
    recurringIssues: ["Small bathrooms recur in lower reviews"],
    aspects: [{ name: "Quietness", sentiment: "positive", summary: "Courtyard rooms are repeatedly described as quiet.", confidence: "high" }],
    sources: [{ title: "Example", url: "https://example.com/reviews" }],
    researchedAt: "2026-07-31T00:00:00.000Z",
    expiresAt: "2026-08-30T00:00:00.000Z",
    model: "test-model"
  };

  const enriched = enrichHotelWithResearch(hotel, profile, "cached");
  assert.ok(enriched.reviewSnippets.some((item) => /quiet central stay/i.test(item)));
  assert.deepEqual(enriched.lowScoreReviewIssues, ["Small bathrooms recur in lower reviews"]);
  assert.equal(enriched.researchSources?.[0].url, "https://example.com/reviews");
  assert.equal(enriched.researchStatus, "cached");
});
