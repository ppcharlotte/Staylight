import type { TravelerProfile, UserPreferences } from "@/lib/types";

export const defaultUserPreferences: UserPreferences = {
  valueForMoney: 4,
  reviewScore: 4,
  quiet: 4,
  location: 3,
  notes: "",
  customPriorities: []
};

export function getPreferenceRequirements(preferences: UserPreferences) {
  const mustHaves: string[] = [];
  const riskPriorities: string[] = [];

  if (preferences.valueForMoney >= 4) riskPriorities.push("Value for money");
  if (preferences.reviewScore >= 4) riskPriorities.push("Rating");
  if (preferences.quiet >= 4) {
    mustHaves.push("Quiet room");
    riskPriorities.push("Noise");
  }
  if (preferences.location >= 4) {
    mustHaves.push("Good location");
    riskPriorities.push("Location");
  }
  for (const preference of preferences.customPriorities) {
    if (preference.score >= 4) {
      mustHaves.push(preference.label);
      riskPriorities.push(preference.label);
    }
  }

  return { mustHaves, riskPriorities };
}

export function applyPreferences(profile: TravelerProfile, preferences: UserPreferences): TravelerProfile {
  const requirements = getPreferenceRequirements(preferences);
  return {
    ...profile,
    mustHaves: [...new Set([...profile.mustHaves, ...requirements.mustHaves])],
    riskPriorities: [...new Set([...profile.riskPriorities, ...requirements.riskPriorities])]
  };
}
