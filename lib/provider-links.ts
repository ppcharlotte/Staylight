type ProviderSearchTrip = {
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
};

function withParams(baseUrl: string, params: Record<string, string | number>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function buildProviderSearchUrl(
  provider: string,
  hotelName: string,
  destination: string,
  trip: ProviderSearchTrip,
  fallbackUrl: string
): string {
  const normalizedProvider = provider.toLowerCase();
  const searchText = `${hotelName}, ${destination}`;

  if (normalizedProvider.includes("booking")) {
    return withParams("https://www.booking.com/searchresults.html", {
      ss: searchText,
      checkin: trip.checkIn,
      checkout: trip.checkOut,
      group_adults: trip.adults,
      no_rooms: trip.rooms
    });
  }
  if (normalizedProvider.includes("agoda")) {
    return withParams("https://www.agoda.com/search", {
      text: searchText,
      checkIn: trip.checkIn,
      checkOut: trip.checkOut,
      adults: trip.adults,
      rooms: trip.rooms
    });
  }
  if (normalizedProvider.includes("expedia")) {
    return withParams("https://www.expedia.com/Hotel-Search", {
      destination: searchText,
      startDate: trip.checkIn,
      endDate: trip.checkOut,
      adults: trip.adults,
      rooms: trip.rooms
    });
  }
  if (normalizedProvider.includes("hotels.com")) {
    return withParams("https://www.hotels.com/Hotel-Search", {
      destination: searchText,
      startDate: trip.checkIn,
      endDate: trip.checkOut,
      adults: trip.adults,
      rooms: trip.rooms
    });
  }
  if (normalizedProvider.includes("trip.com")) {
    return withParams("https://www.trip.com/hotels/list", { searchWord: searchText });
  }
  if (normalizedProvider.includes("tripadvisor")) {
    return withParams("https://www.tripadvisor.com/Search", { q: searchText });
  }

  return fallbackUrl;
}
