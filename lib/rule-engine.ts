import type { HotelCandidate, HotelRecommendation, PriceOffer, TravelerProfile } from "@/lib/types";

type RequirementRule = {
  label: string;
  requestedBy: RegExp;
  positiveEvidence: RegExp;
  negativeEvidence?: RegExp;
  weight: number;
  verify: string;
};

type DealBreakerRule = {
  label: string;
  requestedBy: RegExp;
  mustHaveRequestedBy?: RegExp;
  conflictsWith: RegExp;
};

const dealBreakerRules: DealBreakerRule[] = [
  {
    label: "Hostel accommodation",
    requestedBy: /hostel|youth hostel|青旅|青年旅舍/,
    conflictsWith: /hostel|youth hostel|dormitory accommodation|青旅|青年旅舍/
  },
  {
    label: "Nightlife area",
    requestedBy: /party street|nightlife|club|bar street|夜店|派对街/,
    conflictsWith: /nightlife|bar district|party street|late-night foot traffic|busy late-night|bars nearby|moulin rouge/
  },
  {
    label: "Shared bathroom",
    requestedBy: /shared bathroom|communal bathroom|公共浴室|共用卫生间/,
    mustHaveRequestedBy: /private bathroom|private toilet|en-?suite|own bathroom|独立卫生间|私人浴室/,
    conflictsWith: /shared bathroom|shared toilet|communal bathroom|communal toilet|shared facilities|公共浴室|公共厕所|共用卫生间/
  },
  {
    label: "Small room or missing desk",
    requestedBy: /tiny room|small room|room size|no desk|房间小|没有书桌/,
    conflictsWith: /tiny room|small room|compact|space-efficient|limited storage|no desk|limited work surface/
  },
  {
    label: "Weak Wi-Fi",
    requestedBy: /weak wi-?fi|unreliable internet|poor internet|网络差/,
    conflictsWith: /weak wi-?fi|unreliable wi-?fi|poor internet|unstable internet|网络差/
  },
  {
    label: "No bathtub",
    requestedBy: /no bathtub|shower only|must have (?:a )?bathtub|没有浴缸/,
    conflictsWith: /shower only|rain shower only|no bathtub|没有浴缸/
  },
  {
    label: "Accessibility barrier",
    requestedBy: /stairs|not accessible|no step-free access|无障碍障碍/,
    conflictsWith: /stairs only|no lift|not accessible|no step-free access/
  }
];

const requirementRules: RequirementRule[] = [
  {
    label: "Quiet stay",
    requestedBy: /quiet|noise|light sleeper|sleep|安静|噪音|睡眠/,
    positiveEvidence: /quiet|calm|courtyard|soundproof|residential|garden/,
    negativeEvidence: /nightlife|busy street|street noise|bar district|late-night/,
    weight: 10,
    verify: "Request a quiet room away from lifts and street-facing floors"
  },
  {
    label: "Transit access",
    requestedBy: /transit|metro|station|train|commute|交通|地铁|车站/,
    positiveEvidence: /metro|station|train|transit|walk to|direct airport/,
    weight: 8,
    verify: "Confirm the walking route with luggage"
  },
  {
    label: "Location",
    requestedBy: /good location|location priority|\blocation\b|位置/,
    positiveEvidence: /central|near|walk|metro|station|residential|city center|city centre/,
    weight: 6,
    verify: "Confirm walking times to the places planned for this trip"
  },
  {
    label: "Safety and late arrival",
    requestedBy: /safe|safety|late arrival|late-night safety|安全|夜间/,
    positiveEvidence: /24h|24-hour|staffed reception|safe|central station|well-lit/,
    negativeEvidence: /nightlife|busy late-night|bar district/,
    weight: 8,
    verify: "Confirm staffed reception and the late check-in process"
  },
  {
    label: "Reliable Wi-Fi",
    requestedBy: /wi-fi|wifi|internet|网络/,
    positiveEvidence: /wi-fi|wifi|high-speed internet|workspace/,
    weight: 6,
    verify: "Confirm in-room Wi-Fi speed if video calls are essential"
  },
  {
    label: "Cleanliness",
    requestedBy: /cleanliness|cleaness|cleaniness|clean room|dirty|unclean|hygiene|spotless|干净|卫生|脏/,
    positiveEvidence: /clean|spotless|well-maintained|housekeeping|hygiene/,
    negativeEvidence: /dirty|unclean|dust|stain|mold|mould|housekeeping issue/,
    weight: 9,
    verify: "Ask the hotel about recent housekeeping feedback for the selected room type"
  },
  {
    label: "Work desk",
    requestedBy: /desk|workspace|work|办公|书桌/,
    positiveEvidence: /desk|workspace|work table|usb outlets/,
    negativeEvidence: /no desk|limited work surface/,
    weight: 8,
    verify: "Check the exact room-type photos for desk size and chair"
  },
  {
    label: "Step-free access",
    requestedBy: /step-free|wheelchair|accessible|mobility|无障碍/,
    positiveEvidence: /accessible|step-free|elevator route|lift access|adapted room/,
    weight: 10,
    verify: "Confirm the exact accessible room and step-free entrance before booking"
  },
  {
    label: "Private bathroom",
    requestedBy: /private bathroom|private toilet|en-?suite|own bathroom|独立卫生间|私人浴室/,
    positiveEvidence: /private bathroom|private toilet|en-?suite|own bathroom|独立卫生间|私人浴室/,
    negativeEvidence: /shared bathroom|shared toilet|communal bathroom|communal toilet|shared facilities|公共浴室|公共厕所|共用卫生间/,
    weight: 10,
    verify: "Confirm that the selected room has a private bathroom and toilet"
  },
  {
    label: "Bathtub",
    requestedBy: /bathtub|bath tub|soaking bath|浴缸/,
    positiveEvidence: /bathtub|bath tub|bathroom with bath|ensuite bath/,
    negativeEvidence: /shower only|rain shower only/,
    weight: 7,
    verify: "Confirm that the selected room category includes a bathtub"
  },
  {
    label: "Larger room",
    requestedBy: /large room|larger room|spacious|room size|family room|房间大|空间/,
    positiveEvidence: /spacious|family room|suite|high-ceilinged|20m²|25m²|connecting room/,
    negativeEvidence: /compact|small room|space-efficient/,
    weight: 8,
    verify: "Check floor area and bed configuration for the selected room"
  },
  {
    label: "Fitness facilities",
    requestedBy: /gym|fitness|健身/,
    positiveEvidence: /gym|fitness|wellness facilities/,
    weight: 5,
    verify: "Confirm fitness facilities and opening hours"
  },
  {
    label: "Breakfast",
    requestedBy: /breakfast|早餐/,
    positiveEvidence: /breakfast/,
    weight: 5,
    verify: "Confirm whether breakfast is included in the selected rate"
  },
  {
    label: "Laundry",
    requestedBy: /laundry|washing machine|洗衣/,
    positiveEvidence: /laundry|washing machine|coin laundry/,
    weight: 5,
    verify: "Confirm whether laundry is self-service or paid service"
  },
  {
    label: "Balcony",
    requestedBy: /balcony|terrace|阳台|露台/,
    positiveEvidence: /balcony|terrace/,
    weight: 5,
    verify: "Confirm the selected room category includes a private balcony"
  },
  {
    label: "Central location",
    requestedBy: /city cent(?:er|re)|downtown|central location|市中心/,
    positiveEvidence: /central|city center|city centre|downtown|near the louvre|near ginza/,
    weight: 6,
    verify: "Confirm walking times to the places planned for this trip"
  }
];

function toText(values: unknown): string {
  if (Array.isArray(values)) return values.map(String).join(" ");
  return typeof values === "string" ? values : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function hotelEvidenceText(hotel: HotelCandidate): string {
  return [
    hotel.propertyType ?? "",
    hotel.name,
    hotel.area,
    ...hotel.amenities,
    ...(hotel.excludedAmenities ?? []),
    ...hotel.locationNotes,
    ...hotel.reviewSnippets,
    ...(hotel.lowScoreReviewIssues ?? [])
  ].join(" ").toLowerCase();
}

export function getHotelDealBreakerConflicts(
  hotel: HotelCandidate,
  profile: Partial<TravelerProfile> = {}
): string[] {
  const dealBreakerText = toText(profile.dealBreakers).toLowerCase();
  const mustHaveText = toText(profile.mustHaves).toLowerCase();
  const evidenceText = hotelEvidenceText(hotel);

  return dealBreakerRules
    .filter((rule) => (
      rule.requestedBy.test(dealBreakerText)
      || Boolean(rule.mustHaveRequestedBy?.test(mustHaveText))
    ) && rule.conflictsWith.test(evidenceText))
    .map((rule) => rule.label);
}

export function filterHotelsByDealBreakers(
  hotels: HotelCandidate[],
  profile: Partial<TravelerProfile> = {}
): HotelCandidate[] {
  return hotels.filter((hotel) => getHotelDealBreakerConflicts(hotel, profile).length === 0);
}

function naturalJoin(items: string[]): string {
  if (items.length === 0) return "your priorities";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function buildFallbackDetailSummary(
  fitLabel: string,
  whyItFits: string[],
  verifyBeforeBooking: string[],
  risks: string[] = []
): string {
  const matches = whyItFits
    .filter((item) => !/budget|nightly limit|demo rate|price/i.test(item))
    .map((item) => item.replace(/\s+matches your priorities/i, "").replace(/[.!?]+$/, "").toLowerCase())
    .slice(0, 4);
  const concerns = risks
    .filter((item) => !/budget|nightly limit|demo rate|price|needs room-level verification/i.test(item))
    .map((item) => item.replace(/[.!?]+$/, "").toLowerCase())
    .slice(0, 3);
  const unknowns = verifyBeforeBooking
    .filter((item) => !/price|cancellation/i.test(item))
    .map((item) => item.replace(/^(confirm|check|request)\s+/i, "").replace(/[.!?]+$/, "").toLowerCase())
    .slice(0, 2);
  const contactSentence = unknowns.length > 0
    ? ` Contact the hotel to confirm ${naturalJoin(unknowns)}.`
    : "";
  const concernSentence = concerns.length > 0 ? ` Known concerns include ${naturalJoin(concerns)}.` : "";
  return `${fitLabel} for ${naturalJoin(matches)}.${concernSentence}${contactSentence}`;
}

export function numericPrice(price: string): number {
  return Number(price.replace(/[^0-9.]/g, "")) || 0;
}

export function getLowestPriceOffer(hotel: HotelCandidate): PriceOffer {
  const offers = hotel.priceOffers?.filter((offer) => numericPrice(offer.price) > 0) ?? [];
  if (offers.length > 0) {
    return [...offers].sort((a, b) => numericPrice(a.price) - numericPrice(b.price))[0];
  }
  return {
    provider: hotel.providers[0] ?? "Provider unavailable",
    price: hotel.price,
    url: hotel.sourceUrl ?? "#"
  };
}

export function filterHotelsByBudget(
  hotels: HotelCandidate[],
  _budgetMin?: number,
  budgetMax?: number
): HotelCandidate[] {
  if (!budgetMax || budgetMax <= 0) return hotels;
  return hotels.filter((hotel) => {
    const price = numericPrice(getLowestPriceOffer(hotel).price);
    if (price <= 0) return false;
    if (budgetMax && price > budgetMax) return false;
    return true;
  });
}

export function getComparableRating(hotel: HotelCandidate): number {
  if (hotel.guestRating && hotel.guestRating > 0) {
    return hotel.guestRating > 5 ? hotel.guestRating / 2 : hotel.guestRating;
  }
  return hotel.rating > 0 ? hotel.rating : 0;
}

export function filterHotelsByAccommodationType(
  hotels: HotelCandidate[],
  accommodationType: TravelerProfile["accommodationType"] = "any"
): HotelCandidate[] {
  if (accommodationType === "any") return hotels;
  return hotels.filter((hotel) => {
    const typeEvidence = [
      hotel.propertyType ?? "",
      hotel.name,
      ...hotel.amenities,
      ...(hotel.excludedAmenities ?? []),
      ...hotel.locationNotes,
      ...hotel.reviewSnippets,
      ...(hotel.lowScoreReviewIssues ?? []),
      hotel.dataNote ?? ""
    ].join(" ").toLowerCase();
    const isHostel = /hostel|youth hostel|backpacker|dorm(?:itory)?(?: room| bed| accommodation)?|shared bunk|青旅|青年旅舍/.test(typeEvidence);
    if (accommodationType === "hostel") return isHostel;
    const hasSharedBathroom = /shared bathroom|shared toilet|communal bathroom|communal toilet|shared facilities|公共浴室|公共厕所|共用卫生间/.test(typeEvidence);
    const isAlternativeStay = /bed and breakfast|\bb&b\b|guest\s*house|homestay|pension|vacation rental|holiday home/.test(typeEvidence);
    return !isHostel && !hasSharedBathroom && !isAlternativeStay;
  });
}

export function prioritizeHotelsByMinimumRating(
  hotels: HotelCandidate[],
  minimumRating = 0,
  nearMissRange = 0.3
): HotelCandidate[] {
  if (minimumRating <= 0) return hotels.map((hotel) => ({ ...hotel, ratingBelowPreference: false }));

  const matching = hotels
    .filter((hotel) => getComparableRating(hotel) >= minimumRating)
    .map((hotel) => ({ ...hotel, ratingBelowPreference: false }));
  const nearMisses = hotels
    .filter((hotel) => {
      const rating = getComparableRating(hotel);
      return rating > 0 && rating < minimumRating && rating >= minimumRating - nearMissRange;
    })
    .sort((a, b) => getComparableRating(b) - getComparableRating(a))
    .slice(0, 2)
    .map((hotel) => ({ ...hotel, ratingBelowPreference: true }));

  return [...matching, ...nearMisses];
}

export function filterHotelsByMinimumRating(
  hotels: HotelCandidate[],
  minimumRating = 0
): HotelCandidate[] {
  if (minimumRating <= 0) return hotels.map((hotel) => ({ ...hotel, ratingBelowPreference: false }));
  return hotels
    .filter((hotel) => getComparableRating(hotel) >= minimumRating)
    .map((hotel) => ({ ...hotel, ratingBelowPreference: false }));
}

export function rankHotelsByRules(
  hotels: HotelCandidate[],
  profile: Partial<TravelerProfile> = {}
): HotelRecommendation[] {
  const ratingNearMissIds = new Set(hotels.filter((hotel) => hotel.ratingBelowPreference).map((hotel) => hotel.id));
  const requirementText = [
    toText(profile.mustHaves),
    toText(profile.riskPriorities),
    toText(profile.dealBreakers),
    toText(profile.travelerStyle)
  ].join(" ").toLowerCase();
  const dealBreakerText = toText(profile.dealBreakers).toLowerCase();

  const accommodationEligibleHotels = filterHotelsByAccommodationType(
    hotels,
    profile.accommodationType ?? "any"
  );

  return filterHotelsByDealBreakers(accommodationEligibleHotels, profile)
    .map((hotel) => {
      const positiveEvidenceText = [
        hotel.area,
        ...hotel.amenities,
        ...hotel.locationNotes,
        ...hotel.reviewSnippets
      ].join(" ").toLowerCase();
      const excludedEvidenceText = (hotel.excludedAmenities ?? []).join(" ").toLowerCase();
      const negativeEvidenceText = [
        positiveEvidenceText,
        excludedEvidenceText,
        ...(hotel.lowScoreReviewIssues ?? [])
      ].join(" ").toLowerCase();
      const whyItFits: string[] = [];
      const risks: string[] = [];
      const verifyBeforeBooking: string[] = [];
      const matchedThemes: string[] = [];
      const travelerSpecificFlags: string[] = [];
      let score = 62 + Math.round((hotel.rating - 4) * 8);

      if (hotel.ratingBelowPreference && profile.minimumRating) {
        const comparableRating = getComparableRating(hotel);
        score -= 10;
        risks.push(`${comparableRating.toFixed(1)} rating is below your ${profile.minimumRating.toFixed(1)} minimum`);
        travelerSpecificFlags.push(`Rating: below your ${profile.minimumRating.toFixed(1)} minimum`);
      }

      if (/guest review score|review rating|综合评分|评价/.test(requirementText) && hotel.guestRating) {
        const reviewBoost = hotel.guestRating >= 9 ? 8 : hotel.guestRating >= 8.5 ? 5 : hotel.guestRating >= 8 ? 2 : -5;
        score += reviewBoost;
        matchedThemes.push(`Guest rating ${hotel.guestRating}/10`);
        travelerSpecificFlags.push(`Guest rating: ${hotel.guestRating}/10 aggregate`);
      }

      const price = numericPrice(hotel.price);
      if (profile.budgetMax && price > 0) {
        if (price <= profile.budgetMax) {
          score += 8;
          whyItFits.push(`${hotel.price} demo rate is within the $${profile.budgetMax} nightly limit`);
          matchedThemes.push("Budget fit");
          travelerSpecificFlags.push(`Budget: within your $${profile.budgetMax} nightly limit`);
        } else {
          score -= 18;
          risks.push(`${hotel.price} demo rate is above the nightly budget`);
          travelerSpecificFlags.push(`Budget: ${hotel.price} is above your nightly limit`);
        }
      }

      for (const rule of requirementRules) {
        if (!rule.requestedBy.test(requirementText)) continue;
        const hasKnownConflict = Boolean(rule.negativeEvidence?.test(negativeEvidenceText))
          || rule.positiveEvidence.test(excludedEvidenceText);
        if (hasKnownConflict) {
          score -= rule.weight;
          risks.push(`${rule.label} conflicts with available hotel or review evidence`);
          travelerSpecificFlags.push(`${rule.label}: known conflict`);
        } else if (rule.positiveEvidence.test(positiveEvidenceText)) {
          score += rule.weight;
          whyItFits.push(`${rule.label} matches your priorities`);
          matchedThemes.push(rule.label);
          travelerSpecificFlags.push(`${rule.label}: strong match`);
        } else {
          score -= 2;
          verifyBeforeBooking.push(rule.verify);
          risks.push(`${rule.label} needs room-level verification`);
          travelerSpecificFlags.push(`${rule.label}: verify before booking`);
        }
      }

      if (/party|nightlife|club|bar street|派对|夜店/.test(dealBreakerText) && /nightlife|bar district|busy late-night/.test(negativeEvidenceText)) {
        score -= 14;
        risks.push("The area conflicts with the nightlife deal-breaker");
        travelerSpecificFlags.push("Nightlife sensitivity: area conflict");
      }

      if (whyItFits.length === 0) {
        whyItFits.push(hotel.locationNotes[0] ?? "Real hotel facts are available in the local snapshot");
      }
      if (risks.length === 0) risks.push("Room-specific details can vary by category");
      verifyBeforeBooking.push("Current price and cancellation terms on the official site");

      const boundedScore = Math.max(38, Math.min(96, score));
      const fitLabel = boundedScore >= 86 ? "Strong match" : boundedScore >= 74 ? "Good match" : boundedScore >= 62 ? "Mixed fit" : "Low confidence fit";
      const finalWhyItFits = unique(whyItFits).slice(0, 4);
      const finalVerifyBeforeBooking = unique(verifyBeforeBooking).slice(0, 5);
      const finalRisks = unique(risks).slice(0, 6);
      return {
        hotelId: hotel.id,
        hotelName: hotel.name,
        fitScore: boundedScore,
        fitLabel,
        whyItFits: finalWhyItFits,
        risks: finalRisks,
        reviewLens: {
          positiveThemes: unique(matchedThemes.length > 0 ? matchedThemes : hotel.amenities.slice(0, 3)),
          negativeThemes: unique(hotel.lowScoreReviewIssues ?? []).slice(0, 3),
          travelerSpecificFlags: unique(travelerSpecificFlags).slice(0, 8),
          evidenceNotes: hotel.reviewSnippets.slice(0, 3),
          confidence: matchedThemes.length >= 3 ? "high" : matchedThemes.length >= 1 ? "medium" : "low"
        },
        verifyBeforeBooking: finalVerifyBeforeBooking,
        detailSummary: buildFallbackDetailSummary(fitLabel, finalWhyItFits, finalVerifyBeforeBooking, finalRisks),
        researchSources: hotel.researchSources,
        researchedAt: hotel.researchUpdatedAt
      } satisfies HotelRecommendation;
    })
    .sort((a, b) => {
      const ratingPreferenceOrder = Number(ratingNearMissIds.has(a.hotelId)) - Number(ratingNearMissIds.has(b.hotelId));
      return ratingPreferenceOrder || b.fitScore - a.fitScore;
    });
}

export function selectHotelsForResearch(
  hotels: HotelCandidate[],
  profile: Partial<TravelerProfile> = {},
  limit = 18
): HotelCandidate[] {
  if (hotels.length <= limit) return hotels;

  const boundedLimit = Math.max(1, Math.min(limit, hotels.length));
  const ranked = rankHotelsByRules(hotels, profile);
  const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const prices = hotels.map((hotel) => numericPrice(hotel.price)).filter((price) => price > 0).sort((a, b) => a - b);
  const lowBoundary = prices[Math.floor(prices.length / 3)] ?? 0;
  const highBoundary = prices[Math.floor((prices.length * 2) / 3)] ?? lowBoundary;
  const priceBand = (hotel: HotelCandidate) => {
    const price = numericPrice(hotel.price);
    if (price <= lowBoundary) return "low";
    if (price <= highBoundary) return "mid";
    return "high";
  };
  const selected: HotelCandidate[] = [];
  const selectedIds = new Set<string>();
  const selectedAreas = new Set<string>();
  const selectedBands = new Set<string>();
  const add = (hotel: HotelCandidate | undefined) => {
    if (!hotel || selectedIds.has(hotel.id) || selected.length >= boundedLimit) return;
    selected.push(hotel);
    selectedIds.add(hotel.id);
    selectedAreas.add(hotel.area.trim().toLowerCase());
    selectedBands.add(priceBand(hotel));
  };

  const primaryCount = Math.ceil(boundedLimit * 0.7);
  for (const recommendation of ranked.slice(0, primaryCount)) add(hotelsById.get(recommendation.hotelId));

  const diversityCandidates = ranked.slice(primaryCount)
    .map((recommendation, index) => ({ hotel: hotelsById.get(recommendation.hotelId), index }))
    .filter((item): item is { hotel: HotelCandidate; index: number } => Boolean(item.hotel))
    .map((item) => ({
      ...item,
      diversityScore:
        Number(!selectedAreas.has(item.hotel.area.trim().toLowerCase()))
        + Number(!selectedBands.has(priceBand(item.hotel)))
    }))
    .filter((item) => item.diversityScore > 0)
    .sort((a, b) => b.diversityScore - a.diversityScore || a.index - b.index);
  for (const candidate of diversityCandidates) add(candidate.hotel);
  for (const recommendation of ranked) add(hotelsById.get(recommendation.hotelId));

  return selected;
}
