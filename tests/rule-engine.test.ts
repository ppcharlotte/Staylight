import assert from "node:assert/strict";
import test from "node:test";
import {
  filterHotelsByAccommodationType,
  filterHotelsByBudget,
  filterHotelsByDealBreakers,
  filterHotelsByMinimumRating,
  getComparableRating,
  getLowestPriceOffer,
  prioritizeHotelsByMinimumRating,
  rankHotelsByRules,
  selectHotelsForResearch
} from "../lib/rule-engine";
import type { HotelCandidate } from "../lib/types";

function hotel(overrides: Partial<HotelCandidate>): HotelCandidate {
  return {
    id: "hotel",
    name: "Test Hotel",
    area: "Central district",
    rating: 4,
    reviewCount: 100,
    price: "$160",
    nights: 2,
    providers: ["Official site"],
    amenities: [],
    imageUrl: "https://example.com/hotel.jpg",
    locationNotes: [],
    reviewSnippets: [],
    ...overrides
  };
}

test("budget filtering treats the maximum as a ceiling and keeps cheaper hotels", () => {
  const hotels = [
    hotel({ id: "low", price: "$129" }),
    hotel({ id: "min", price: "$130" }),
    hotel({ id: "max", price: "$190" }),
    hotel({ id: "high", price: "$191" })
  ];

  assert.deepEqual(filterHotelsByBudget(hotels, 130, 190).map(({ id }) => id), ["low", "min", "max"]);
});

test("budget filtering uses the lowest valid platform offer", () => {
  const candidate = hotel({
    id: "multi-platform",
    price: "$240",
    priceOffers: [
      { provider: "Official site", price: "$240", url: "https://example.com/official" },
      { provider: "Booking.com", price: "$175", url: "https://example.com/booking" }
    ]
  });

  assert.deepEqual(filterHotelsByBudget([candidate], 130, 190).map(({ id }) => id), ["multi-platform"]);
});

test("lowest platform offer is selected independently of provider order", () => {
  const candidate = hotel({
    priceOffers: [
      { provider: "Official site", price: "$180", url: "https://example.com/official" },
      { provider: "Booking.com", price: "$155", url: "https://example.com/booking" },
      { provider: "Expedia", price: "$170", url: "https://example.com/expedia" }
    ]
  });

  assert.equal(getLowestPriceOffer(candidate).provider, "Booking.com");
  assert.equal(getLowestPriceOffer(candidate).price, "$155");
});

test("cleanliness evidence changes the personalized recommendation", () => {
  const cleanHotel = hotel({
    id: "clean",
    amenities: ["Daily housekeeping"],
    reviewSnippets: ["Guests repeatedly describe spotless rooms."]
  });
  const uncertainHotel = hotel({ id: "uncertain" });
  const recommendations = rankHotelsByRules([cleanHotel, uncertainHotel], {
    mustHaves: ["Clean room"],
    riskPriorities: ["Cleanliness"]
  });

  assert.equal(recommendations[0].hotelId, "clean");
  assert.ok(recommendations[0].whyItFits.includes("Cleanliness matches your priorities"));
  assert.ok(recommendations[0].fitScore > recommendations[1].fitScore);
});

test("an explicitly excluded amenity is a known conflict, not a supported match", () => {
  const candidate = hotel({
    id: "no-gym",
    amenities: ["Free Wi-Fi"],
    excludedAmenities: ["No fitness center"]
  });
  const recommendation = rankHotelsByRules([candidate], { mustHaves: ["Fitness facilities"] })[0];

  assert.ok(recommendation.risks.some((item) => /fitness facilities conflicts/i.test(item)));
  assert.ok(recommendation.reviewLens.travelerSpecificFlags.includes("Fitness facilities: known conflict"));
  assert.equal(recommendation.verifyBeforeBooking.some((item) => /fitness/i.test(item)), false);
});

test("deal breaker conflicts are removed before ranking", () => {
  const hostel = hotel({
    id: "hostel",
    name: "Central Youth Hostel",
    propertyType: "hostel",
    price: "$90"
  });
  const regularHotel = hotel({ id: "regular", name: "Central Hotel", propertyType: "hotel" });
  const profile = { dealBreakers: ["Hostel"], riskPriorities: ["Avoid hostels"] };

  assert.deepEqual(filterHotelsByDealBreakers([hostel, regularHotel], profile).map(({ id }) => id), ["regular"]);
  assert.deepEqual(rankHotelsByRules([hostel, regularHotel], profile).map(({ hotelId }) => hotelId), ["regular"]);
});

test("risk priorities influence ranking without becoming hard exclusions", () => {
  const compactHotel = hotel({ id: "compact", amenities: ["Compact room"] });

  assert.deepEqual(
    filterHotelsByDealBreakers([compactHotel], { riskPriorities: ["Room size"] }).map(({ id }) => id),
    ["compact"]
  );
});

test("explicit nightlife deal breakers remove hotels with conflicting evidence", () => {
  const nightlifeHotel = hotel({ id: "nightlife", locationNotes: ["Busy nightlife and late-night foot traffic"] });
  const quietHotel = hotel({ id: "quiet", locationNotes: ["Calm residential district"] });

  assert.deepEqual(
    filterHotelsByDealBreakers([nightlifeHotel, quietHotel], { dealBreakers: ["Party street"] }).map(({ id }) => id),
    ["quiet"]
  );
});

test("known room-level deal breakers are hard exclusions only when conflict evidence exists", () => {
  const compactHotel = hotel({ id: "compact", amenities: ["Compact room", "Limited work surface"] });
  const unknownRoom = hotel({ id: "unknown-room", amenities: ["Free Wi-Fi"] });

  assert.deepEqual(
    filterHotelsByDealBreakers([compactHotel, unknownRoom], { dealBreakers: ["Tiny room with no desk"] }).map(({ id }) => id),
    ["unknown-room"]
  );
});

test("hotel-only selection removes hostels before ranking", () => {
  const hostel = hotel({ id: "hostel", name: "City Hostel", propertyType: "hostel" });
  const disguisedHostel = hotel({
    id: "disguised-hostel",
    name: "Generator Central",
    propertyType: "hotel",
    locationNotes: ["A social backpacker property with dormitory rooms and shared bunks"]
  });
  const regularHotel = hotel({ id: "regular", name: "City Hotel", propertyType: "hotel" });
  const sharedBathroom = hotel({
    id: "shared-bathroom",
    name: "Budget Hotel",
    propertyType: "hotel",
    amenities: ["Shared bathroom and shared toilet"]
  });
  const bedAndBreakfast = hotel({
    id: "bed-and-breakfast",
    name: "City Rooms",
    propertyType: "Bed and breakfast"
  });

  assert.deepEqual(
    filterHotelsByAccommodationType(
      [hostel, disguisedHostel, sharedBathroom, bedAndBreakfast, regularHotel],
      "hotel"
    ).map(({ id }) => id),
    ["regular"]
  );
});

test("private bathroom must-have excludes known shared facilities", () => {
  const sharedBathroom = hotel({ id: "shared", reviewSnippets: ["Rooms use a communal toilet and shared bathroom"] });
  const privateBathroom = hotel({ id: "private", amenities: ["Private ensuite bathroom"] });
  const profile = { mustHaves: ["Private bathroom"] };

  assert.deepEqual(
    filterHotelsByDealBreakers([sharedBathroom, privateBathroom], profile).map(({ id }) => id),
    ["private"]
  );
  assert.deepEqual(
    rankHotelsByRules([sharedBathroom, privateBathroom], { ...profile, accommodationType: "hotel" }).map(({ hotelId }) => hotelId),
    ["private"]
  );
});

test("rating threshold appends only close near-misses and marks them", () => {
  const matching = hotel({ id: "matching", rating: 4.6 });
  const close = hotel({ id: "close", rating: 4.3 });
  const tooLow = hotel({ id: "low", rating: 4.1 });
  const results = prioritizeHotelsByMinimumRating([close, tooLow, matching], 4.5);

  assert.deepEqual(results.map(({ id }) => id), ["matching", "close"]);
  assert.equal(results[0].ratingBelowPreference, false);
  assert.equal(results[1].ratingBelowPreference, true);
  assert.equal(getComparableRating(hotel({ guestRating: 8.8 })), 4.4);
});

test("hard rating filtering excludes every hotel below the selected minimum", () => {
  const matching = hotel({ id: "matching", rating: 4.5 });
  const close = hotel({ id: "close", rating: 4.4 });

  assert.deepEqual(filterHotelsByMinimumRating([close, matching], 4.5).map(({ id }) => id), ["matching"]);
});

test("research shortlist reserves space for area and price diversity", () => {
  const candidates = Array.from({ length: 10 }, (_, index) => hotel({
    id: `central-${index}`,
    area: "Central",
    rating: 4.9 - index * 0.02,
    price: `$${100 + index * 5}`
  }));
  candidates.push(hotel({ id: "harbor", area: "Harbor", rating: 4.1, price: "$260" }));

  const shortlist = selectHotelsForResearch(candidates, {}, 6);
  assert.equal(shortlist.length, 6);
  assert.ok(shortlist.some(({ id }) => id === "harbor"));
});

test("rating near-misses remain behind matching hotels after fit ranking", () => {
  const matching = hotel({ id: "matching", rating: 4.5 });
  const close = hotel({
    id: "close",
    rating: 4.4,
    ratingBelowPreference: true,
    amenities: ["Quiet", "Breakfast", "Gym", "Work desk"]
  });
  const recommendations = rankHotelsByRules([matching, close], {
    minimumRating: 4.5,
    mustHaves: ["Quiet room", "Breakfast", "Fitness facilities", "Work desk"]
  });

  assert.equal(recommendations.at(-1)?.hotelId, "close");
  assert.match(recommendations.at(-1)?.risks.join(" ") ?? "", /below your 4\.5 minimum/i);
});
