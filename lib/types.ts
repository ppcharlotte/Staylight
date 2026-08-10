export type TripBasics = {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
  budgetMin: number;
  budgetMax: number;
  accommodationType: "hotel" | "hostel" | "any";
  minimumRating: number;
};

export type CustomPreference = {
  label: string;
  score: number;
};

export type UserPreferences = {
  valueForMoney: number;
  reviewScore: number;
  quiet: number;
  location: number;
  notes: string;
  customPriorities: CustomPreference[];
};

export type TravelerProfile = {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
  dates: string;
  party: string;
  budgetMin: number;
  budgetMax: number;
  budget: string;
  accommodationType: "hotel" | "hostel" | "any";
  minimumRating: number;
  mustHaves: string[];
  dealBreakers: string[];
  travelerStyle: string;
  riskPriorities: string[];
};

export type HotelCandidate = {
  id: string;
  name: string;
  propertyType?: string;
  area: string;
  rating: number;
  guestRating?: number;
  reviewCount: number;
  price: string;
  nights: number;
  providers: string[];
  priceOffers?: PriceOffer[];
  amenities: string[];
  excludedAmenities?: string[];
  imageUrl: string;
  locationNotes: string[];
  reviewSnippets: string[];
  lowScoreReviewIssues?: string[];
  sourceUrl?: string;
  snapshotDate?: string;
  dataNote?: string;
  ratingBelowPreference?: boolean;
  researchSources?: ResearchSource[];
  researchUpdatedAt?: string;
  researchStatus?: "fresh" | "cached" | "stale" | "unavailable";
};

export type ResearchSource = {
  title: string;
  url: string;
};

export type HotelAspectEvidence = {
  name: string;
  sentiment: "positive" | "negative" | "mixed" | "unknown";
  summary: string;
  confidence: "high" | "medium" | "low";
};

export type HotelResearchProfile = {
  key: string;
  hotelId: string;
  hotelName: string;
  area: string;
  destination: string;
  summary: string;
  positiveThemes: string[];
  recurringIssues: string[];
  aspects: HotelAspectEvidence[];
  sources: ResearchSource[];
  researchedAt: string;
  expiresAt: string;
  model: string;
};

export type PriceOffer = {
  provider: string;
  price: string;
  url: string;
};

export type ReviewLens = {
  positiveThemes: string[];
  negativeThemes: string[];
  travelerSpecificFlags: string[];
  evidenceNotes: string[];
  confidence: "high" | "medium" | "low";
};

export type HotelRecommendation = {
  hotelId: string;
  hotelName: string;
  fitScore: number;
  fitLabel: string;
  whyItFits: string[];
  risks: string[];
  reviewLens: ReviewLens;
  verifyBeforeBooking: string[];
  detailSummary: string;
  researchSources?: ResearchSource[];
  researchedAt?: string;
};
