import { applyPreferences } from "@/lib/preferences";
import type { TravelerProfile, TripBasics, UserPreferences } from "@/lib/types";

export const defaultTripBasics: TripBasics = {
  destination: "Tokyo",
  checkIn: "2026-09-15",
  checkOut: "2026-09-20",
  adults: 1,
  rooms: 1,
  budgetMin: 0,
  budgetMax: 190,
  accommodationType: "hotel",
  minimumRating: 4
};

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatDateRange(checkIn: string, checkOut: string): string {
  return `${formatDate(checkIn)} - ${formatDate(checkOut)}`;
}

export function formatBudget(_budgetMin: number, budgetMax: number): string {
  return `Up to $${budgetMax} per room/night`;
}

export function getNightCount(checkIn: string, checkOut: string): number {
  const difference = Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`);
  return Math.max(1, Math.round(difference / 86_400_000) || 1);
}

export function profileFromTripBasics(trip: TripBasics, preferences?: UserPreferences): TravelerProfile {
  const profile: TravelerProfile = {
    ...trip,
    dates: formatDateRange(trip.checkIn, trip.checkOut),
    budget: formatBudget(trip.budgetMin, trip.budgetMax),
    party: "",
    mustHaves: [],
    dealBreakers: [],
    travelerStyle: "",
    riskPriorities: []
  };
  return preferences ? applyPreferences(profile, preferences) : profile;
}
