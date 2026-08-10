import { NextResponse } from "next/server";
import { z } from "zod";
import { extractLiveHotelEvidence } from "@/lib/hotel-evidence";
import { getSampleHotels } from "@/lib/sample-data";
import { buildProviderSearchUrl } from "@/lib/provider-links";
import {
  filterHotelsByAccommodationType,
  filterHotelsByBudget,
  filterHotelsByDealBreakers,
  filterHotelsByMinimumRating,
  numericPrice,
} from "@/lib/rule-engine";
import { getNightCount } from "@/lib/trip";

const searchSchema = z.object({
  profile: z
    .object({
      destination: z.string().min(1),
      checkIn: z.string().min(1),
      checkOut: z.string().min(1),
      adults: z.number().int().positive().optional(),
      rooms: z.number().int().positive().optional(),
      budgetMin: z.number().nonnegative().optional(),
      budgetMax: z.number().positive().optional(),
      budget: z.string().optional(),
      accommodationType: z.enum(["hotel", "hostel", "any"]).default("hotel"),
      minimumRating: z.number().min(0).max(5).default(0),
      mustHaves: z.array(z.string()).default([]),
      dealBreakers: z.array(z.string()).default([]),
      riskPriorities: z.array(z.string()).default([]),
      travelerStyle: z.string().default("")
    })
    .passthrough(),
  mode: z.enum(["sample", "live"]).default("sample")
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nightlyPrice(rate: Record<string, unknown>, fallback?: unknown): string {
  const extracted = Number(rate.extracted_lowest);
  if (Number.isFinite(extracted) && extracted > 0) return `$${Math.round(extracted)}`;
  if (typeof rate.lowest === "string" && rate.lowest.trim()) return rate.lowest;
  if (typeof fallback === "number" && fallback > 0) return `$${Math.round(fallback)}`;
  if (typeof fallback === "string" && fallback.trim()) return fallback;
  return "";
}

async function fetchGoogleHotelProperties(baseParams: URLSearchParams): Promise<unknown[]> {
  const properties: unknown[] = [];
  let nextPageToken = "";

  for (let page = 0; page < 3 && properties.length < 60; page += 1) {
    const params = new URLSearchParams(baseParams);
    if (nextPageToken) params.set("next_page_token", nextPageToken);

    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      next: { revalidate: 3600 }
    });
    if (!response.ok) throw new Error(`SerpApi returned ${response.status}`);

    const data = asRecord(await response.json());
    const pageProperties = Array.isArray(data.properties) ? data.properties : [];
    properties.push(...pageProperties);

    const pagination = asRecord(data.serpapi_pagination);
    nextPageToken = typeof pagination.next_page_token === "string"
      ? pagination.next_page_token
      : typeof data.next_page_token === "string"
        ? data.next_page_token
        : "";
    if (!nextPageToken || pageProperties.length === 0) break;
  }

  return properties;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = searchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hotel search request." }, { status: 400 });
  }

  const wantsLive = parsed.data.mode === "live";
  const nights = getNightCount(parsed.data.profile.checkIn, parsed.data.profile.checkOut);
  const destinationHotels = getSampleHotels(parsed.data.profile.destination);
  const bundledHotels = filterHotelsByMinimumRating(
    filterHotelsByBudget(
      filterHotelsByAccommodationType(
        filterHotelsByDealBreakers(destinationHotels.map((hotel) => ({
          ...hotel,
          nights
        })), parsed.data.profile),
        parsed.data.profile.accommodationType
      ),
      parsed.data.profile.budgetMin,
      parsed.data.profile.budgetMax
    ),
    parsed.data.profile.minimumRating
  );

  if (!wantsLive) {
    return NextResponse.json({
      source: "sample",
      hotels: bundledHotels,
      limitations: ["Sample mode is active for local judging and repeatable demos."]
    });
  }

  if (!process.env.SERPAPI_API_KEY) {
    return NextResponse.json({
      source: "unavailable",
      hotels: [],
      limitations: ["Live search requires SERPAPI_API_KEY. No sample hotels were substituted."]
    }, { status: 503 });
  }

  const accommodationQuery = parsed.data.profile.accommodationType === "hotel"
    ? `${parsed.data.profile.destination} hotels`
    : parsed.data.profile.accommodationType === "hostel"
      ? `${parsed.data.profile.destination} hostels`
      : parsed.data.profile.destination;
  const params = new URLSearchParams({
    engine: "google_hotels",
    q: accommodationQuery,
    check_in_date: parsed.data.profile.checkIn,
    check_out_date: parsed.data.profile.checkOut,
    adults: String(parsed.data.profile.adults ?? 1),
    rooms: String(parsed.data.profile.rooms ?? 1),
    currency: "USD",
    gl: "us",
    hl: "en",
    api_key: process.env.SERPAPI_API_KEY
  });
  if (parsed.data.profile.accommodationType === "hostel") params.set("property_types", "14");

  try {
    const properties = await fetchGoogleHotelProperties(params);

    if (properties.length === 0) {
      throw new Error("SerpApi returned no hotel candidates.");
    }

    const uniqueProperties = properties.filter((rawProperty, index, all) => {
      const property = asRecord(rawProperty);
      const key = String(property.property_token ?? property.name ?? `live-${index}`).trim().toLowerCase();
      return all.findIndex((candidate, candidateIndex) => {
        const candidateProperty = asRecord(candidate);
        const candidateKey = String(candidateProperty.property_token ?? candidateProperty.name ?? `live-${candidateIndex}`).trim().toLowerCase();
        return candidateKey === key;
      }) === index;
    });

    const mappedHotels = uniqueProperties.map((rawProperty: unknown, index: number) => {
      const property = asRecord(rawProperty);
      const propertyName = String(property.name ?? "Unknown hotel");
      const evidence = extractLiveHotelEvidence(property, parsed.data.profile.destination);
      const ratePerNight = asRecord(property.rate_per_night);
      const images = Array.isArray(property.images) ? property.images : [];
      const firstImage = asRecord(images[0]);
      const prices = Array.isArray(property.prices) ? property.prices : [];
      const fallbackUrl = typeof property.link === "string"
        ? property.link
        : `https://www.google.com/travel/hotels?q=${encodeURIComponent(propertyName)}`;
      const priceOffers = prices
        .slice(0, 5)
        .map((rawPrice) => {
          const price = asRecord(rawPrice);
          const offerRate = asRecord(price.rate_per_night);
          const provider = String(price.source ?? "Provider");
          return {
            provider,
            price: nightlyPrice(offerRate, price.price),
            url: typeof price.link === "string"
              ? price.link
              : buildProviderSearchUrl(
                provider,
                propertyName,
                parsed.data.profile.destination,
                {
                  checkIn: parsed.data.profile.checkIn,
                  checkOut: parsed.data.profile.checkOut,
                  adults: parsed.data.profile.adults ?? 1,
                  rooms: parsed.data.profile.rooms ?? 1
                },
                fallbackUrl
              )
          };
        })
        .filter((offer) => numericPrice(offer.price) > 0);
      const fallbackOffer = {
        provider: String(property.source ?? "Google Hotels"),
        price: nightlyPrice(ratePerNight, property.price),
        url: fallbackUrl
      };
      const availableOffers = (priceOffers.length > 0 ? priceOffers : [fallbackOffer])
        .filter((offer) => numericPrice(offer.price) > 0)
        .sort((a, b) => numericPrice(a.price) - numericPrice(b.price));
      const propertyPrice = nightlyPrice(ratePerNight, property.price) || availableOffers[0]?.price || "Price unavailable";

      return {
        id: String(property.property_token ?? `live-${index}`),
        name: propertyName,
        propertyType: String(property.type ?? property.property_type ?? "hotel"),
        area: String(property.neighborhood ?? property.area ?? parsed.data.profile.destination),
        rating: Number(property.overall_rating ?? property.rating ?? 0),
        reviewCount: Number(property.reviews ?? 0),
        price: propertyPrice,
        nights,
        providers: availableOffers.map((offer) => offer.provider),
        priceOffers: availableOffers,
        amenities: evidence.amenities,
        excludedAmenities: evidence.excludedAmenities,
        imageUrl:
          typeof firstImage.thumbnail === "string"
            ? firstImage.thumbnail
            : "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
        locationNotes: evidence.locationNotes.length > 0 ? evidence.locationNotes : [evidence.areaFallback],
        reviewSnippets: evidence.reviewSnippets,
        lowScoreReviewIssues: evidence.lowScoreReviewIssues,
        sourceUrl: fallbackUrl
      };
    });
    const afterDealBreakers = filterHotelsByDealBreakers(mappedHotels, parsed.data.profile);
    const afterAccommodationType = filterHotelsByAccommodationType(
      afterDealBreakers,
      parsed.data.profile.accommodationType
    );
    const afterBudget = filterHotelsByBudget(
      afterAccommodationType,
      parsed.data.profile.budgetMin,
      parsed.data.profile.budgetMax
    );
    const afterRating = filterHotelsByMinimumRating(afterBudget, parsed.data.profile.minimumRating);
    const hotels = afterRating.slice(0, 40);
    const searchStats = {
      fetched: properties.length,
      unique: mappedHotels.length,
      afterDealBreakers: afterDealBreakers.length,
      afterAccommodationType: afterAccommodationType.length,
      afterBudget: afterBudget.length,
      afterRating: afterRating.length
    };

    return NextResponse.json({
      source: "serpapi",
      hotels,
      searchStats,
      limitations: hotels.length > 0
        ? ["Provider coverage and review details vary by hotel and Google Hotels query."]
        : ["No live hotels satisfied the budget and hard trip requirements. No constraints were relaxed."]
    });
  } catch (error) {
    return NextResponse.json({
      source: "error",
      hotels: [],
      limitations: [error instanceof Error ? error.message : "Live hotel search failed."]
    }, { status: 502 });
  }
}
