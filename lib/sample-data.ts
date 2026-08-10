import { rankHotelsByRules } from "@/lib/rule-engine";
import type { HotelCandidate, HotelRecommendation, TravelerProfile } from "@/lib/types";
import { defaultTripBasics, formatBudget, formatDateRange } from "@/lib/trip";

export const demoProfile: TravelerProfile = {
  ...defaultTripBasics,
  dates: formatDateRange(defaultTripBasics.checkIn, defaultTripBasics.checkOut),
  party: "Solo traveler",
  budget: formatBudget(defaultTripBasics.budgetMin, defaultTripBasics.budgetMax),
  mustHaves: ["Quiet room", "Near transit", "Reliable Wi-Fi", "Safe late arrival"],
  dealBreakers: ["Party street", "Weak Wi-Fi", "Tiny room with no desk"],
  travelerStyle: "Practical, safety-conscious, willing to pay more to reduce uncertainty",
  riskPriorities: ["Value for money", "Noise", "Late-night safety", "Room size", "Commute friction"]
};

const snapshotDate = "2026-07-20";
const sharedImages = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80"
];

type HotelSeed = Omit<HotelCandidate, "nights" | "providers" | "imageUrl" | "reviewCount" | "snapshotDate" | "dataNote"> & {
  image: number;
};

function localHotel(seed: HotelSeed): HotelCandidate {
  const { image, ...hotel } = seed;
  const numericRate = Number(hotel.price.replace(/[^0-9.]/g, ""));
  const hotelQuery = encodeURIComponent(hotel.name);
  const priceOffers = [
    { provider: "Official site", price: hotel.price, url: hotel.sourceUrl ?? `https://www.google.com/search?q=${hotelQuery}` },
    { provider: "Booking.com", price: `$${numericRate + 8}`, url: `https://www.booking.com/searchresults.html?ss=${hotelQuery}` },
    { provider: "Expedia", price: `$${numericRate + 15}`, url: `https://www.expedia.com/Hotel-Search?destination=${hotelQuery}` }
  ];
  return {
    ...hotel,
    nights: 5,
    providers: priceOffers.map((offer) => offer.provider),
    priceOffers,
    imageUrl: sharedImages[image],
    reviewCount: 0,
    snapshotDate,
    dataNote: "Hotel facts are stored locally from official sources; nightly prices are demo estimates, not live quotes."
  };
}

const sampleHotelSets: Record<string, HotelCandidate[]> = {
  tokyo: [
    localHotel({
      id: "tokyo-nohga-ueno", name: "NOHGA HOTEL UENO TOKYO", area: "Ueno", rating: 4, guestRating: 8.9,
      price: "$175", image: 0, sourceUrl: "https://www.nohgahotel.com/ueno/en/",
      amenities: ["Free Wi-Fi", "Accessible room on request", "24-hour fitness", "Laundry", "Bathtub in selected rooms"],
      locationNotes: ["3-minute walk from Tokyo Metro Ueno Station", "5-minute walk from JR Ueno Station", "Elevator route is documented for travelers with luggage"],
      lowScoreReviewIssues: ["Standard rooms can feel compact", "Street-facing rooms may pick up Ueno traffic noise"],
      reviewSnippets: ["Official room facts list free Wi-Fi and USB sockets.", "Selected room types include an ensuite bathtub.", "The hotel lists an accessible room and an elevator route from Ueno Station."]
    }),
    localHotel({
      id: "tokyo-hotel-niwa", name: "Hotel Niwa Tokyo", area: "Kanda / Suidobashi", rating: 4, guestRating: 8.8,
      price: "$160", image: 1, sourceUrl: "https://www.hotelniwa.jp/en/",
      amenities: ["Free Wi-Fi", "Work desk", "Fitness room", "Japanese garden", "Bath amenities"],
      locationNotes: ["Short walk from Suidobashi Station", "Calmer business and university district", "Convenient access to central Tokyo"],
      lowScoreReviewIssues: ["Entry-level rooms can feel small", "Bath layouts vary noticeably by room category"],
      reviewSnippets: ["Official room pages list desks and in-room amenities.", "Garden lounges offer quieter shared space.", "Room layouts and bath features vary by category."]
    }),
    localHotel({
      id: "tokyo-jr-mets-akihabara", name: "JR-East Hotel Mets Premier Akihabara", area: "Akihabara", rating: 4, guestRating: 8.7,
      price: "$145", image: 2, sourceUrl: "https://www.hotelmets.jp/en/akihabara/",
      amenities: ["Free Wi-Fi", "Work desk", "Bathtub", "24-hour reception", "Coin laundry"],
      locationNotes: ["Immediately beside JR Akihabara Station", "Direct rail access across Tokyo", "Busy electronics and nightlife area"],
      lowScoreReviewIssues: ["Station activity can bother sensitive sleepers", "Compact layouts leave limited luggage space"],
      reviewSnippets: ["The JR-East hotel group emphasizes station-adjacent locations.", "Stored room facts include separate bath features in selected categories.", "The area remains active into the evening."]
    }),
    localHotel({
      id: "tokyo-gate-hotel", name: "THE GATE HOTEL TOKYO by HULIC", area: "Yurakucho / Ginza", rating: 4, guestRating: 9.0,
      price: "$230", image: 3, sourceUrl: "https://www.gate-hotel.jp/en/tokyo/",
      amenities: ["Free Wi-Fi", "Work desk", "Larger room options", "24-hour reception", "Restaurant"],
      locationNotes: ["Near Yurakucho, Ginza, and Tokyo Station", "Central shopping and business location", "Well-connected late into the evening"],
      lowScoreReviewIssues: ["Rates can feel high for the room size", "The Ginza surroundings can feel crowded"],
      reviewSnippets: ["Official access information places the hotel near Yurakucho and Ginza.", "Multiple larger room categories are offered.", "The demo estimate sits above a mid-range budget."]
    }),
    localHotel({
      id: "tokyo-sequence-miyashita", name: "sequence MIYASHITA PARK", area: "Shibuya", rating: 4, guestRating: 8.3,
      price: "$135", image: 4, sourceUrl: "https://www.sequencehotels.com/miyashita-park/",
      amenities: ["Free Wi-Fi", "Compact rooms", "Self check-in", "Cafe and bar", "Near transit"],
      locationNotes: ["Close to Shibuya Station", "Inside the MIYASHITA PARK area", "Busy nightlife and late-night foot traffic"],
      lowScoreReviewIssues: ["Rooms have limited storage space", "Late-night Shibuya noise can reach some rooms"],
      reviewSnippets: ["The property uses space-efficient room layouts.", "Shibuya offers excellent rail access.", "The surrounding area is active and may not suit nightlife-sensitive travelers."]
    }),
    localHotel({
      id: "tokyo-mitsui-jingugaien", name: "Mitsui Garden Hotel Jingugaien Tokyo Premier", area: "Shinjuku / Sendagaya", rating: 4, guestRating: 8.7,
      price: "$190", image: 5, sourceUrl: "https://www.gardenhotels.co.jp/jingugaien-tokyo-premier/eng/",
      amenities: ["Free Wi-Fi", "Work desk", "Public bath", "Balcony rooms", "Fitness room"],
      locationNotes: ["Near Kokuritsu-kyogijo Station", "Overlooks a greener, calmer part of central Tokyo", "Rail access to Shinjuku"],
      lowScoreReviewIssues: ["Rail-facing rooms may hear passing trains", "The public bath can become busy at peak times"],
      reviewSnippets: ["Official facilities include a public bath and fitness room.", "Many rooms include balconies.", "The greener setting provides stronger quiet evidence than Shibuya."]
    })
  ],
  copenhagen: [
    localHotel({
      id: "cph-hotel-ottilia", name: "Hotel Ottilia", area: "Carlsberg City / Vesterbro", rating: 4, guestRating: 8.6,
      price: "$185", image: 0, sourceUrl: "https://www.brochner-hotels.com/hotel-ottilia/",
      amenities: ["High-speed Wi-Fi", "Work desk", "Restaurant", "Wine hour", "Fitness access"],
      locationNotes: ["Located in the former Carlsberg brewery district", "Near S-train connections", "Restaurants and bars nearby"],
      lowScoreReviewIssues: ["Industrial room layouts can feel dark", "Nearby restaurants and bars create evening noise"],
      reviewSnippets: ["Official and listing facts describe high-speed Wi-Fi throughout.", "The rooftop restaurant overlooks Copenhagen.", "Vesterbro access is convenient but can be lively."]
    }),
    localHotel({
      id: "cph-absalon", name: "Absalon Hotel", area: "Vesterbro", rating: 4, guestRating: 8.8,
      price: "$165", image: 1, sourceUrl: "https://absalon-hotel.dk/",
      amenities: ["Free Wi-Fi", "Family room options", "24-hour reception", "Bike rental", "Breakfast"],
      locationNotes: ["Close to Copenhagen Central Station", "Short walk to Tivoli", "Active Vesterbro streets nearby"],
      lowScoreReviewIssues: ["Street-facing rooms can be noisy", "Some bathrooms feel compact"],
      reviewSnippets: ["VisitCopenhagen identifies Absalon as a family-owned Vesterbro hotel.", "Its central-station location supports airport and regional connections.", "Street-facing room noise should be verified."]
    }),
    localHotel({
      id: "cph-wakeup-borgergade", name: "Wakeup Copenhagen Borgergade", area: "Indre By", rating: 3, guestRating: 8.0,
      price: "$120", image: 2, sourceUrl: "https://www.wakeupcopenhagen.com/the-hotels/copenhagen/borgergade",
      amenities: ["Free Wi-Fi", "Compact rooms", "24-hour reception", "Bike rental", "Accessible rooms"],
      locationNotes: ["Central location near Kongens Nytorv", "Metro access to the airport", "Walkable to Nyhavn"],
      lowScoreReviewIssues: ["Rooms are very small", "Storage and desk space are limited"],
      reviewSnippets: ["The concept focuses on affordable, space-efficient rooms.", "Central metro access is a strong value signal.", "Compact rooms may conflict with larger-room requirements."]
    }),
    localHotel({
      id: "cph-kong-arthur", name: "Hotel Kong Arthur", area: "Nansensgade / Lakes", rating: 4, guestRating: 8.7,
      price: "$195", image: 3, sourceUrl: "https://www.arthurhotels.dk/hotel-kong-arthur/",
      amenities: ["Free Wi-Fi", "Courtyard", "Spa access", "Family room options", "Bike rental"],
      locationNotes: ["Near Norreport Station", "Set beside the Copenhagen lakes", "Courtyard rooms provide stronger quiet evidence"],
      lowScoreReviewIssues: ["Room size varies substantially", "Older room categories can feel dated"],
      reviewSnippets: ["The property centers on an inner courtyard.", "Norreport connects metro, train, and airport services.", "Room size varies considerably by category."]
    }),
    localHotel({
      id: "cph-villa-copenhagen", name: "Villa Copenhagen", area: "Central Station", rating: 5, guestRating: 8.7,
      price: "$245", image: 4, sourceUrl: "https://villacopenhagen.com/",
      amenities: ["Free Wi-Fi", "Work desk", "Accessible rooms", "Outdoor pool", "24-hour reception"],
      locationNotes: ["Beside Copenhagen Central Station", "Direct airport train access", "Large restored former post-office building"],
      lowScoreReviewIssues: ["Prices are high compared with room size", "Service can slow down during busy periods"],
      reviewSnippets: ["Official materials describe a 390-room restored landmark.", "Rooms include dedicated desk lighting and work surfaces.", "The demo rate is positioned above mid-range budgets."]
    }),
    localHotel({
      id: "cph-scandic-spectrum", name: "Scandic Spectrum", area: "Kalvebod Brygge", rating: 4, guestRating: 8.1,
      price: "$210", image: 5, sourceUrl: "https://www.scandichotels.com/hotels/denmark/copenhagen/scandic-spectrum",
      amenities: ["Free Wi-Fi", "Accessible rooms", "Family rooms", "Pool and spa", "24-hour reception"],
      locationNotes: ["Waterfront location near Central Station", "Walkable to Tivoli and city center", "Large full-service property"],
      lowScoreReviewIssues: ["Breakfast areas can become crowded", "The large property can feel impersonal"],
      reviewSnippets: ["The hotel lists accessible and family room categories.", "The larger property offers extensive wellness facilities.", "Walking distance to Central Station supports airport travel."]
    })
  ],
  paris: [
    localHotel({
      id: "paris-hotel-fabric", name: "Hotel Fabric", area: "11th arrondissement / Oberkampf", rating: 4, guestRating: 9.2,
      price: "$185", image: 0, sourceUrl: "https://www.hotelfabric.com/",
      amenities: ["Free Wi-Fi", "Work desk", "Soundproof windows", "Steam room", "Family room options"],
      locationNotes: ["Near Oberkampf and Parmentier Metro", "Converted former textile workshop", "Courtyard-facing rooms available"],
      lowScoreReviewIssues: ["Standard rooms can feel small", "Oberkampf-facing rooms may hear street noise"],
      reviewSnippets: ["Official room pages describe high ceilings, soundproof windows, and desks.", "Club rooms face the inner courtyard.", "Triple and quadruple room categories are available for families."]
    }),
    localHotel({
      id: "paris-citizenm-gare-lyon", name: "citizenM Paris Gare de Lyon", area: "12th arrondissement", rating: 4, guestRating: 8.4,
      price: "$170", image: 1, sourceUrl: "https://www.marriott.com/en-us/hotels/parly-citizenm-paris-gare-de-lyon/overview/",
      amenities: ["Free Wi-Fi", "Workspace", "24-hour reception", "Accessible rooms", "Rain shower only"],
      locationNotes: ["Beside Gare de Lyon", "Direct metro and regional rail access", "Busy major-station environment"],
      lowScoreReviewIssues: ["Rooms are compact with limited storage", "Standard rooms do not include a bathtub"],
      reviewSnippets: ["Official facts highlight Wi-Fi, large beds, and shared workspaces.", "Accessible room inventory is documented.", "Standard rooms prioritize compact, efficient layouts."]
    }),
    localHotel({
      id: "paris-hotel-le-six", name: "Hotel Le Six", area: "6th arrondissement / Montparnasse", rating: 4, guestRating: 9.0,
      price: "$205", image: 2, sourceUrl: "https://www.hotel-le-six.com/en/",
      amenities: ["Free Wi-Fi", "Work desk", "Spa", "Accessible room", "24-hour reception"],
      locationNotes: ["Near Notre-Dame-des-Champs Metro", "Between Montparnasse and Luxembourg Gardens", "Residential side streets nearby"],
      lowScoreReviewIssues: ["Some rooms feel small", "Sound can travel between adjoining rooms"],
      reviewSnippets: ["The official site positions Le Six as a four-star hotel and spa.", "Its side-street setting provides moderate quiet evidence.", "Confirm the exact accessible room configuration directly."]
    }),
    localHotel({
      id: "paris-malte-astotel", name: "Hotel Malte - Astotel", area: "2nd arrondissement / Louvre", rating: 4, guestRating: 9.1,
      price: "$190", image: 3, sourceUrl: "https://www.astotel.com/en/hotel/hotel-malte-en/",
      amenities: ["Free Wi-Fi", "Work desk", "Bathtub in selected rooms", "Family rooms", "24-hour reception"],
      locationNotes: ["Near the Louvre and Palais Royal", "Multiple Metro lines nearby", "Central but not primarily a nightlife district"],
      lowScoreReviewIssues: ["Entry-level rooms are compact", "Bathroom layouts vary by room type"],
      reviewSnippets: ["Official room facts list Wi-Fi, minibar, and courtesy tray.", "Selected room descriptions include bathrooms with shower and bath.", "Family and solo room categories are offered."]
    }),
    localHotel({
      id: "paris-joke-astotel", name: "Hotel Joke - Astotel", area: "9th arrondissement / Blanche", rating: 3, guestRating: 9.0,
      price: "$145", image: 4, sourceUrl: "https://www.astotel.com/en/hotel/hotel-joke-en/",
      amenities: ["Free Wi-Fi", "Family connecting rooms", "Breakfast", "24-hour reception", "Larger privilege rooms"],
      locationNotes: ["Near Blanche Metro and Montmartre", "Close to Moulin Rouge", "Busy nightlife and bar district"],
      lowScoreReviewIssues: ["Nightlife noise affects street-facing rooms", "Standard rooms can feel small"],
      reviewSnippets: ["Official pages list connecting rooms for families and groups.", "Privilege rooms are described as more spacious.", "The immediate area conflicts with nightlife-sensitive requirements."]
    }),
    localHotel({
      id: "paris-joyce-astotel", name: "Hotel Joyce - Astotel", area: "9th arrondissement / Saint-Georges", rating: 3, guestRating: 8.8,
      price: "$160", image: 5, sourceUrl: "https://www.astotel.com/en/hotel/hotel-joyce-en/",
      amenities: ["Free Wi-Fi", "Work desk", "Family room options", "24-hour reception", "Complimentary soft drinks"],
      locationNotes: ["Near Saint-Georges Metro", "Walkable to South Pigalle", "Quieter than the streets immediately around Blanche"],
      lowScoreReviewIssues: ["Street-facing rooms may pick up traffic noise", "Family layouts vary by room category"],
      reviewSnippets: ["The Astotel room offer includes desks and Wi-Fi.", "Family configurations vary by room type.", "Ask for a courtyard-facing room to reduce street noise."]
    })
  ]
};

function normalizeDestination(destination: string): keyof typeof sampleHotelSets | null {
  const normalized = destination.trim().toLowerCase();
  if (normalized.includes("copenhagen") || normalized.includes("kobenhavn")) return "copenhagen";
  if (normalized.includes("paris")) return "paris";
  if (normalized.includes("tokyo")) return "tokyo";
  return null;
}

export function isSampleDestinationSupported(destination: string): boolean {
  return normalizeDestination(destination) !== null;
}

export function getSampleHotels(destination: string): HotelCandidate[] {
  const normalized = normalizeDestination(destination);
  return normalized ? sampleHotelSets[normalized] : [];
}

export function getSampleRecommendations(
  destination: string,
  profile: Partial<TravelerProfile> = demoProfile
): HotelRecommendation[] {
  return rankHotelsByRules(getSampleHotels(destination), profile);
}

export function getBundledRecommendations(
  hotelIds: string[],
  profile: Partial<TravelerProfile> = demoProfile
): HotelRecommendation[] | null {
  const hotelSet = Object.values(sampleHotelSets).find((hotels) => hotelIds.every((id) => hotels.some((hotel) => hotel.id === id)));
  if (!hotelSet) return null;
  const selectedHotels = hotelIds.map((id) => hotelSet.find((hotel) => hotel.id === id)).filter((hotel): hotel is HotelCandidate => Boolean(hotel));
  return rankHotelsByRules(selectedHotels, profile);
}

export const sampleHotels = getSampleHotels("Tokyo");
export const sampleRecommendations = getSampleRecommendations("Tokyo", demoProfile);
