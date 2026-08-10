import assert from "node:assert/strict";
import test from "node:test";
import { buildSummaryRequirements } from "../lib/prompts";

test("builds an explicit summary checklist while excluding price requirements", () => {
  const requirements = buildSummaryRequirements({
    accommodationType: "hotel",
    minimumRating: 4.5,
    mustHaves: ["Quiet room", "Reliable Wi-Fi"],
    dealBreakers: ["Party street"],
    riskPriorities: ["Quiet sleep", "Value for money"],
    travelerStyle: "Traveling for work"
  });

  assert.deepEqual(requirements, [
    "Hotel accommodation only; exclude hostels",
    "Aggregate rating of 4.5 or higher",
    "Quiet room",
    "Reliable Wi-Fi",
    "Avoid Party street",
    "Quiet sleep",
    "Traveling for work"
  ]);
});
