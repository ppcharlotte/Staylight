import assert from "node:assert/strict";
import test from "node:test";
import { extractLiveHotelEvidence } from "../lib/hotel-evidence";

test("preserves hotel facts, nearby transport, exclusions, and review themes", () => {
  const evidence = extractLiveHotelEvidence({
    description: "A quiet hotel beside Central Station.",
    amenities: ["Free Wi-Fi", "Work desk"],
    excluded_amenities: ["No fitness center"],
    nearby_places: [{ name: "Central Station", transportations: [{ type: "Walking", duration: "4 min" }] }],
    reviews_breakdown: [
      { name: "Cleanliness", description: "Rooms are usually spotless", total_mentioned: 40, positive: 37, negative: 3 },
      { name: "Noise", description: "Street noise affects some rooms", total_mentioned: 12, positive: 2, negative: 10 }
    ]
  }, "Copenhagen");

  assert.deepEqual(evidence.amenities, ["Free Wi-Fi", "Work desk"]);
  assert.deepEqual(evidence.excludedAmenities, ["No fitness center"]);
  assert.ok(evidence.locationNotes.some((item) => item.includes("Walking 4 min")));
  assert.ok(evidence.reviewSnippets.some((item) => item.includes("37 positive, 3 negative")));
  assert.deepEqual(evidence.lowScoreReviewIssues, ["Noise: Street noise affects some rooms"]);
});
