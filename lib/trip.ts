import { applyPreferences } from "./preferences";
import type { TravelerProfile, TripBasics, UserPreferences } from "@/lib/types";

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayDateInputValue(now = new Date()): string {
  return formatDateInputValue(now);
}

export function addDaysToDateInput(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateInputValue(date);
}

export function getDefaultTripDates(now = new Date()): Pick<TripBasics, "checkIn" | "checkOut"> {
  const today = getTodayDateInputValue(now);
  return {
    checkIn: addDaysToDateInput(today, 1),
    checkOut: addDaysToDateInput(today, 6)
  };
}

const defaultTripDates = getDefaultTripDates();

export const defaultTripBasics: TripBasics = {
  destination: "Tokyo",
  ...defaultTripDates,
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
