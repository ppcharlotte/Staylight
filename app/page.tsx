"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDollarSign,
  FileText,
  ExternalLink,
  ListFilter,
  LoaderCircle,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  SendHorizontal,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { demoProfile, getSampleHotels, getSampleRecommendations, isSampleDestinationSupported, sampleHotels, sampleRecommendations } from "@/lib/sample-data";
import { applyPreferences, defaultUserPreferences } from "@/lib/preferences";
import { extractRequirementPriorities, isNoMoreAnswer } from "@/lib/requirements";
import {
  filterHotelsByAccommodationType,
  filterHotelsByBudget,
  filterHotelsByDealBreakers,
  filterHotelsByMinimumRating,
  getHotelDealBreakerConflicts,
  getComparableRating,
  getLowestPriceOffer,
  rankHotelsByRules,
  selectHotelsForResearch
} from "@/lib/rule-engine";
import { defaultTripBasics, formatBudget, formatDateRange, profileFromTripBasics } from "@/lib/trip";
import type { HotelCandidate, HotelRecommendation, TravelerProfile, TripBasics, UserPreferences } from "@/lib/types";

const tabs = ["Trip", "Results", "Details", "Profile"] as const;
type Tab = (typeof tabs)[number];
type SearchMode = "sample" | "live";
type InterviewPhase = "collecting" | "final_check" | "confirmed";

const sampleDestinations = ["Tokyo", "Copenhagen", "Paris"] as const;

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

type Capabilities = {
  openaiConfigured: boolean;
  serpApiConfigured: boolean;
  model: string;
};

type ResearchBatchSummary = {
  total: number;
  researched: number;
  cached: number;
  stale: number;
  unavailable: number;
};

const PREFERENCES_STORAGE_KEY = "staylight-user-preferences";
const LEGACY_PREFERENCES_STORAGE_KEY = "staylens-user-preferences";
const INITIAL_RESEARCH_LIMIT = 18;
const ADDITIONAL_RESEARCH_BATCH_SIZE = 12;

function parseCustomPreferenceLabels(value: string): string[] {
  const normalizeLabel = (rawLabel: string) => {
    const label = rawLabel
      .replace(/^(?:i|we)\s+(?:always\s+)?(?:need|want|prefer|care about)\s+(?:a|an|the)?\s*/i, "")
      .replace(/[.!?。！？]+$/g, "")
      .trim();
    if (/^(?:desk|work desk|workspace)$/i.test(label)) return "Work desk";
    if (/step-free|wheelchair|accessible|无障碍/i.test(label)) return "Step-free access";
    if (/firm mattress|硬床垫/i.test(label)) return "Firm mattress";
    if (/balcony|terrace|阳台|露台/i.test(label)) return "Balcony";
    if (/breakfast|早餐/i.test(label)) return "Breakfast";
    return label;
  };

  return [
    ...new Set(
      value
        .split(/[,，;；\n]|\s+and\s+/i)
        .map(normalizeLabel)
        .filter(Boolean)
    )
  ];
}

function normalizeStoredPreferences(value: unknown): UserPreferences {
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const notes = typeof stored.notes === "string" ? stored.notes : "";
  const customPriorities = Array.isArray(stored.customPriorities)
    ? stored.customPriorities
        .filter((item): item is { label: string; score: number } => Boolean(item && typeof item === "object" && typeof item.label === "string"))
        .map((item) => ({ label: item.label.trim(), score: Math.min(5, Math.max(1, Number(item.score) || 3)) }))
        .filter((item) => item.label)
    : parseCustomPreferenceLabels(notes).map((label) => ({ label, score: 4 }));

  return {
    valueForMoney: Number(stored.valueForMoney) || defaultUserPreferences.valueForMoney,
    reviewScore: Number(stored.reviewScore ?? stored.safety) || defaultUserPreferences.reviewScore,
    quiet: Number(stored.quiet) || defaultUserPreferences.quiet,
    location: Number(stored.location ?? stored.transit) || defaultUserPreferences.location,
    notes,
    customPriorities
  };
}

function initialChatMessages(trip: TripBasics): ChatMessage[] {
  return [{
    role: "assistant",
    content: `Your saved preferences, ${trip.destination} trip basics, stay type, and rating choice are applied. Who is traveling, and what is different or especially important for this stay?`
  }];
}

function scoreTone(score: number) {
  if (score >= 86) return "scoreHigh";
  if (score >= 76) return "scoreMid";
  return "scoreRisk";
}

function addKnownPriorities(value: string, summarized: Set<string>): boolean {
  const matches = extractRequirementPriorities(value);
  matches.forEach((label) => {
    summarized.add(label);
  });
  return matches.length > 0;
}

function summarizePriorities(profile: TravelerProfile, messages: ChatMessage[]): string[] {
  const summarized = new Set<string>();
  const structuredValues = [
    ...profile.riskPriorities,
    ...profile.mustHaves,
    ...profile.dealBreakers.map((item) => `Avoid ${item}`)
  ];

  for (const value of structuredValues) {
    if (!addKnownPriorities(value, summarized)) summarized.add(value);
  }

  const conversationClauses = messages
    .filter((message) => message.role === "user" && !isNoMoreAnswer(message.content))
    .flatMap((message) => message.content.split(/[.;。；]|[,，]\s*|\s+and\s+/i))
    .map((clause) => clause.trim())
    .filter(Boolean);

  for (const clause of conversationClauses) {
    addKnownPriorities(clause, summarized);
  }

  return [...summarized];
}

function requirementMapsToPriority(value: string, priority: string): boolean {
  const mapped = new Set<string>();
  addKnownPriorities(value, mapped);
  return mapped.has(priority) || value.trim().toLowerCase() === priority.trim().toLowerCase();
}

function removeDismissedFromProfile(profile: TravelerProfile, dismissed: Set<string>): TravelerProfile {
  const isDismissed = (value: string) => [...dismissed].some((priority) => requirementMapsToPriority(value, priority));
  return {
    ...profile,
    mustHaves: profile.mustHaves.filter((item) => !isDismissed(item)),
    riskPriorities: profile.riskPriorities.filter((item) => !isDismissed(item)),
    dealBreakers: profile.dealBreakers.filter((item) => !isDismissed(`Avoid ${item}`))
  };
}

async function researchAndAnalyzeHotels(
  candidates: HotelCandidate[],
  profile: TravelerProfile
): Promise<{ hotels: HotelCandidate[]; recommendations: HotelRecommendation[]; research: ResearchBatchSummary }> {
  const researchResponse = await fetch("/api/hotels/research-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destination: profile.destination, hotels: candidates })
  });
  const researchPayload = await researchResponse.json();
  if (!researchResponse.ok) {
    throw new Error(typeof researchPayload.error === "string" ? researchPayload.error : "Hotel review research failed.");
  }
  const researchedHotels = Array.isArray(researchPayload.hotels) ? researchPayload.hotels : candidates;

  const analyzeResponse = await fetch("/api/hotels/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile, hotels: researchedHotels })
  });
  const analyzePayload = await analyzeResponse.json();
  if (!analyzeResponse.ok) throw new Error("Hotel analysis failed.");

  return {
    hotels: researchedHotels,
    recommendations: Array.isArray(analyzePayload.recommendations) ? analyzePayload.recommendations : [],
    research: researchPayload.research ?? {
      total: researchedHotels.length,
      researched: 0,
      cached: 0,
      stale: 0,
      unavailable: researchedHotels.length
    }
  };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("Trip");
  const [selectedId, setSelectedId] = useState(sampleRecommendations[0].hotelId);
  const [hotels, setHotels] = useState(sampleHotels);
  const [recommendations, setRecommendations] = useState(sampleRecommendations);
  const [remainingHotels, setRemainingHotels] = useState<HotelCandidate[]>([]);
  const [excludedHotels, setExcludedHotels] = useState<HotelCandidate[]>([]);
  const [hasSearchResults, setHasSearchResults] = useState(false);
  const [tripBasics, setTripBasics] = useState<TripBasics>(defaultTripBasics);
  const [tripBasicsLocked, setTripBasicsLocked] = useState(false);
  const [interviewMessages, setInterviewMessages] = useState<ChatMessage[]>([]);
  const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>("collecting");
  const [travelerProfile, setTravelerProfile] = useState<TravelerProfile | null>(null);
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [interviewError, setInterviewError] = useState("");
  const [profileSource, setProfileSource] = useState("sample");
  const [searchMode, setSearchMode] = useState<SearchMode>("sample");
  const [dataSource, setDataSource] = useState("sample");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzingMore, setIsAnalyzingMore] = useState(false);
  const [runNote, setRunNote] = useState("Confirm this trip's requirements to unlock hotel search");
  const [error, setError] = useState("");
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(defaultUserPreferences);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [dismissedPriorities, setDismissedPriorities] = useState<Set<string>>(new Set());

  const selectedRecommendation = useMemo(
    () =>
      recommendations.find((item) => item.hotelId === selectedId) ??
      recommendations[0] ??
      sampleRecommendations[0],
    [recommendations, selectedId]
  );
  const selectedHotel = getHotel(selectedRecommendation.hotelId, hotels);
  const activeProfile = travelerProfile ?? demoProfile;

  useEffect(() => {
    let isMounted = true;

    try {
      const savedPreferences = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_PREFERENCES_STORAGE_KEY);
      if (savedPreferences) {
        const normalizedPreferences = normalizeStoredPreferences(JSON.parse(savedPreferences));
        setUserPreferences(normalizedPreferences);
        window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(normalizedPreferences));
      }
    } catch {
      setUserPreferences(defaultUserPreferences);
    }

    fetch("/api/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (isMounted && payload) setCapabilities(payload);
      })
      .catch(() => {
        if (isMounted) setCapabilities(null);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function saveUserPreferences(nextPreferences: UserPreferences) {
    setUserPreferences(nextPreferences);
    setPreferencesSaved(true);
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(nextPreferences));
    } catch {
      setRunNote("Preferences are active for this session, but this browser blocked local storage.");
    }
    if (travelerProfile) {
      setTravelerProfile(applyPreferences(travelerProfile, nextPreferences));
      setHasSearchResults(false);
      setRunNote("Saved profile preferences were updated. Search again when ready.");
    }
    window.setTimeout(() => setPreferencesSaved(false), 1800);
  }

  async function submitInterviewAnswer(answer: string, finishRequested = false) {
    const wasConfirmed = interviewPhase === "confirmed";
    const nextMessages: ChatMessage[] = [...interviewMessages, { role: "user", content: answer }];
    setInterviewMessages(nextMessages);
    setIsInterviewing(true);
    setInterviewError("");

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          tripBasics,
          preferences: userPreferences,
          currentProfile: travelerProfile,
          phase: interviewPhase,
          mode: searchMode,
          finishRequested
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "The concierge could not process that answer.");
      }
      const nextPhase: InterviewPhase = ["collecting", "final_check", "confirmed"].includes(payload.phase)
        ? payload.phase
        : "collecting";

      if (payload.profile) setTravelerProfile(removeDismissedFromProfile(payload.profile, dismissedPriorities));
      setInterviewPhase(nextPhase);
      setProfileSource(String(payload.source ?? "sample"));
      if (wasConfirmed) setHasSearchResults(false);
      if (nextPhase === "confirmed") setRunNote("Trip requirements confirmed. Ready to search.");
      if (nextPhase === "final_check") setRunNote("Confirm the updated trip requirements to search again.");

      if (typeof payload.assistantMessage === "string" && payload.assistantMessage.trim()) {
        setInterviewMessages([...nextMessages, { role: "assistant", content: payload.assistantMessage }]);
      }
    } catch (error) {
      setInterviewError(error instanceof Error ? error.message : "The concierge could not continue.");
    } finally {
      setIsInterviewing(false);
    }
  }

  function resetInterview() {
    setInterviewMessages(initialChatMessages(tripBasics));
    setInterviewPhase("collecting");
    setTravelerProfile(profileFromTripBasics(tripBasics, userPreferences));
    setInterviewError("");
    setProfileSource("sample");
    setHasSearchResults(false);
    setActiveTab("Trip");
    setRunNote("Confirm this trip's requirements to unlock hotel search");
    setDismissedPriorities(new Set());
  }

  function startInterview(nextTripBasics: TripBasics) {
    setTripBasics(nextTripBasics);
    setTripBasicsLocked(true);
    setTravelerProfile(profileFromTripBasics(nextTripBasics, userPreferences));
    setInterviewMessages(initialChatMessages(nextTripBasics));
    setInterviewPhase("collecting");
    setInterviewError("");
    setHasSearchResults(false);
    setRunNote("Confirm this trip's requirements to unlock hotel search");
    setDismissedPriorities(new Set());
  }

  function removeRiskPriority(priority: string) {
    const nextDismissed = new Set(dismissedPriorities).add(priority);
    setDismissedPriorities(nextDismissed);
    setTravelerProfile((current) => current ? removeDismissedFromProfile(current, nextDismissed) : current);
    setHasSearchResults(false);
    setRunNote(`${priority} was removed from this trip. Search again when ready.`);
  }

  function updateTripBasics(nextTripBasics: TripBasics) {
    setTripBasics(nextTripBasics);
    setTravelerProfile((currentProfile) => currentProfile ? {
      ...currentProfile,
      ...nextTripBasics,
      dates: formatDateRange(nextTripBasics.checkIn, nextTripBasics.checkOut),
      budget: formatBudget(nextTripBasics.budgetMin, nextTripBasics.budgetMax)
    } : profileFromTripBasics(nextTripBasics, userPreferences));
    setHasSearchResults(false);
    setRunNote("Trip basics updated. Your conversation and requirements are unchanged.");
  }

  async function runHotelSearch() {
    if (tripBasics.budgetMax < 1) {
      setError("Enter a maximum nightly budget.");
      setRunNote("Update the budget before searching.");
      return;
    }
    if (searchMode === "sample" && !isSampleDestinationSupported(activeProfile.destination)) {
      setError("Sample mode supports Tokyo, Copenhagen, and Paris. Select Live for other destinations.");
      setRunNote("Choose Live mode to search this destination.");
      return;
    }
    setIsSearching(true);
    setRemainingHotels([]);
    setExcludedHotels([]);
    setError("");
    setRunNote(searchMode === "live" ? "Searching live hotel sources..." : "Searching sample hotels...");

    try {
      const searchResponse = await fetch("/api/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: {
            destination: activeProfile.destination,
            checkIn: tripBasics.checkIn,
            checkOut: tripBasics.checkOut,
            adults: activeProfile.adults,
            rooms: activeProfile.rooms,
            budgetMin: activeProfile.budgetMin,
            budgetMax: activeProfile.budgetMax,
            budget: activeProfile.budget,
            accommodationType: activeProfile.accommodationType,
            minimumRating: activeProfile.minimumRating,
            mustHaves: activeProfile.mustHaves,
            dealBreakers: activeProfile.dealBreakers,
            riskPriorities: activeProfile.riskPriorities,
            travelerStyle: activeProfile.travelerStyle
          },
          mode: searchMode
        })
      });

      const searchPayload = await searchResponse.json();
      if (!searchResponse.ok) {
        const limitation = Array.isArray(searchPayload.limitations) ? searchPayload.limitations[0] : "";
        throw new Error(limitation || "Hotel search failed.");
      }
      const returnedHotels = Array.isArray(searchPayload.hotels) ? searchPayload.hotels : [];
      const nextHotels = filterHotelsByMinimumRating(
        filterHotelsByBudget(
          filterHotelsByAccommodationType(
            filterHotelsByDealBreakers(returnedHotels, activeProfile),
            activeProfile.accommodationType
          ),
          activeProfile.budgetMin,
          activeProfile.budgetMax
        ),
        activeProfile.minimumRating
      );
      const searchStats = searchPayload.searchStats && typeof searchPayload.searchStats === "object"
        ? searchPayload.searchStats as Record<string, unknown>
        : null;
      const uniqueCandidateCount = Number(searchStats?.unique ?? 0);
      if (nextHotels.length === 0) {
        const limitation = Array.isArray(searchPayload.limitations) ? searchPayload.limitations[0] : "";
        throw new Error(limitation || `No eligible hotels found within $${activeProfile.budgetMax} per room per night.`);
      }
      const researchLimit = Math.min(INITIAL_RESEARCH_LIMIT, nextHotels.length);
      const shortlist = selectHotelsForResearch(nextHotels, activeProfile, researchLimit);
      const shortlistIds = new Set(shortlist.map((hotel) => hotel.id));
      const laterCandidates = nextHotels.filter((hotel) => !shortlistIds.has(hotel.id));
      setDataSource(String(searchPayload.source ?? "unknown"));
      setRunNote(`Researching reviews for ${shortlist.length} shortlisted hotels...`);

      const analyzed = await researchAndAnalyzeHotels(shortlist, activeProfile);
      const analyzedRecommendations = analyzed.recommendations;
      if (searchMode === "live" && analyzedRecommendations.length === 0) {
        throw new Error("Live analysis returned no valid hotel recommendations.");
      }
      const nextRecommendations = analyzedRecommendations.length > 0
        ? analyzedRecommendations
        : getSampleRecommendations(activeProfile.destination, activeProfile);
      const recommendedIds = new Set(nextRecommendations.map((recommendation) => recommendation.hotelId));
      const newlyExcludedHotels = analyzed.hotels.filter((hotel) => !recommendedIds.has(hotel.id));
      setHotels(analyzed.hotels);
      setRemainingHotels(laterCandidates);
      setExcludedHotels(newlyExcludedHotels);
      setRecommendations(nextRecommendations);
      setSelectedId(nextRecommendations[0]?.hotelId ?? analyzed.hotels[0]?.id ?? sampleRecommendations[0].hotelId);
      const coverageNote = uniqueCandidateCount > 0
        ? ` · ${nextHotels.length} matched from ${uniqueCandidateCount} unique search candidates`
        : "";
      setRunNote(`${nextRecommendations.length} verified matches${newlyExcludedHotels.length > 0 ? ` · ${newlyExcludedHotels.length} removed after review verification` : ""}${laterCandidates.length > 0 ? ` · ${laterCandidates.length} awaiting review` : ""}${coverageNote}`);
      setHasSearchResults(true);
      setActiveTab("Results");
    } catch (searchError) {
      const fallbackReason = searchError instanceof Error ? searchError.message : "The live request could not complete.";
      if (searchMode === "live") {
        setError(fallbackReason);
        setHotels([]);
        setRecommendations([]);
        setRemainingHotels([]);
        setExcludedHotels([]);
        setHasSearchResults(false);
        setActiveTab("Trip");
        setRunNote("Live search stopped without relaxing your requirements or substituting sample hotels.");
        return;
      }
      const fallbackHotels = filterHotelsByMinimumRating(
        filterHotelsByBudget(
          filterHotelsByAccommodationType(
            filterHotelsByDealBreakers(getSampleHotels(activeProfile.destination), activeProfile),
            activeProfile.accommodationType
          ),
          activeProfile.budgetMin,
          activeProfile.budgetMax
        ),
        activeProfile.minimumRating
      );
      if (fallbackHotels.length === 0) {
        setError(fallbackReason);
        setHotels([]);
        setRecommendations([]);
        setRemainingHotels([]);
        setExcludedHotels([]);
        setHasSearchResults(false);
        setActiveTab("Trip");
        setRunNote(`No hotels found within $${activeProfile.budgetMax} per room per night.`);
        return;
      }
      setError("");
      const fallbackRecommendations = rankHotelsByRules(fallbackHotels, activeProfile);
      setHotels(fallbackHotels);
      setRemainingHotels([]);
      setExcludedHotels([]);
      setRecommendations(fallbackRecommendations);
      setDataSource("sample");
      setSelectedId(fallbackRecommendations[0].hotelId);
      setHasSearchResults(true);
      setActiveTab("Results");
      setRunNote("Sample search recovered with bundled options within your budget.");
    } finally {
      setIsSearching(false);
    }
  }

  async function analyzeMoreHotels() {
    if (remainingHotels.length === 0 || isAnalyzingMore) return;
    setIsAnalyzingMore(true);
    setError("");
    const nextBatch = selectHotelsForResearch(remainingHotels, activeProfile, Math.min(ADDITIONAL_RESEARCH_BATCH_SIZE, remainingHotels.length));
    const nextIds = new Set(nextBatch.map((hotel) => hotel.id));
    setRunNote(`Researching ${nextBatch.length} more hotels...`);

    try {
      const analyzed = await researchAndAnalyzeHotels(nextBatch, activeProfile);
      const analyzedRecommendationIds = new Set(analyzed.recommendations.map((recommendation) => recommendation.hotelId));
      const newlyExcludedHotels = analyzed.hotels.filter((hotel) => !analyzedRecommendationIds.has(hotel.id));
      setHotels((current) => [...current, ...analyzed.hotels.filter((hotel) => !current.some((item) => item.id === hotel.id))]);
      setRecommendations((current) => [...current, ...analyzed.recommendations]
        .filter((recommendation, index, all) => all.findIndex((item) => item.hotelId === recommendation.hotelId) === index)
        .sort((a, b) => b.fitScore - a.fitScore));
      setExcludedHotels((current) => [...current, ...newlyExcludedHotels]
        .filter((hotel, index, all) => all.findIndex((item) => item.id === hotel.id) === index));
      setRemainingHotels((current) => current.filter((hotel) => !nextIds.has(hotel.id)));
      setRunNote(`${analyzed.recommendations.length} additional matches${newlyExcludedHotels.length > 0 ? ` · ${newlyExcludedHotels.length} removed after review verification` : ""}`);
    } catch (moreError) {
      setError(moreError instanceof Error ? moreError.message : "More hotels could not be analyzed.");
      setRunNote("The existing ranked results are unchanged.");
    } finally {
      setIsAnalyzingMore(false);
    }
  }

  function handleBack() {
    if (activeTab === "Details") return setActiveTab("Results");
    if (activeTab === "Results" || activeTab === "Profile") return setActiveTab("Trip");
  }

  return (
    <main className="stage">
      <section className="phoneShell" aria-label="Staylight mobile app preview">
        <div className="statusBar">
          <span>9:41</span>
          <span className="statusPill" />
          <span className="statusIcons">5G</span>
        </div>

        <header className="appHeader">
          <button
            className="iconButton"
            type="button"
            aria-label="Back"
            disabled={activeTab === "Trip"}
            onClick={handleBack}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="headerTitle">
            <img className="headerLogo" src="/staylight-mark-64.png" alt="" />
            <div className="headerCopy">
              <p className="eyebrow">Staylight</p>
              <h1>
                {activeTab === "Profile"
                  ? "Your Profile"
                  : activeTab === "Details"
                    ? "Hotel Details"
                    : activeTab === "Results"
                      ? `${tripBasics.destination} Results`
                      : "Modify your preferences"}
              </h1>
            </div>
          </div>
          <span className="headerSpacer" aria-hidden="true" />
        </header>

        <div className="screenScroll">
          {activeTab === "Trip" && (
            <TripScreen
              capabilities={capabilities}
              error={interviewError}
              interviewMessages={interviewMessages}
              interviewPhase={interviewPhase}
              dismissedPriorities={dismissedPriorities}
              isInterviewing={isInterviewing}
              isSearching={isSearching}
              mode={searchMode}
              profile={travelerProfile}
              profileSource={profileSource}
              runNote={runNote}
              tripBasics={tripBasics}
              tripBasicsLocked={tripBasicsLocked}
              onAnswer={submitInterviewAnswer}
              onTripBasicsChange={updateTripBasics}
              onModeChange={setSearchMode}
              onRemovePriority={removeRiskPriority}
              onReset={resetInterview}
              onSearch={runHotelSearch}
              onStartInterview={startInterview}
            />
          )}
          {activeTab === "Results" && (
            <ResultsScreen
              error={error}
              dataSource={dataSource}
              excludedHotels={excludedHotels}
              hotels={hotels}
              profile={activeProfile}
              recommendations={recommendations}
              isAnalyzingMore={isAnalyzingMore}
              remainingCount={remainingHotels.length}
              runNote={runNote}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setActiveTab("Details");
              }}
              onAnalyzeMore={analyzeMoreHotels}
            />
          )}
          {activeTab === "Details" && (
            <DetailsScreen hotel={selectedHotel} recommendation={selectedRecommendation} />
          )}
          {activeTab === "Profile" && (
            <UserProfileScreen
              preferences={userPreferences}
              saved={preferencesSaved}
              onSave={saveUserPreferences}
            />
          )}
        </div>

        <nav className="bottomNav" aria-label="Main navigation">
          {tabs.map((tab) => {
            const Icon = tab === "Trip" ? BedDouble : tab === "Results" ? ListFilter : tab === "Details" ? FileText : UserRound;
            const disabled = (tab === "Results" || tab === "Details") && !hasSearchResults;
            return (
              <button
                aria-label={tab}
                className={activeTab === tab ? "selected" : ""}
                disabled={disabled}
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
              >
                <Icon size={19} />
                <span>{tab}</span>
              </button>
            );
          })}
        </nav>
      </section>

      <aside className="desktopPanel" aria-label="Build summary">
        <div className="brandMark">
          <Sparkles size={20} />
          <span>OpenAI Build Week</span>
        </div>
        <h2>Personal hotel decisions with clear risk evidence.</h2>
        <p>
          Staylight remembers long-term preferences, gathers only trip-specific requirements, then explains hotel fit,
          risks, confidence, and what to verify before booking.
        </p>
        <div className="desktopStats">
          <span>Sample mode ready</span>
          <span>Server-side keys</span>
          <span>Mobile-first MVP</span>
        </div>
      </aside>
    </main>
  );
}

function getHotel(id: string, hotels: HotelCandidate[]): HotelCandidate {
  return hotels.find((hotel) => hotel.id === id) ?? hotels[0] ?? sampleHotels[0];
}

function TripScreen({
  capabilities,
  dismissedPriorities,
  error,
  interviewMessages,
  interviewPhase,
  isInterviewing,
  isSearching,
  mode,
  profile,
  profileSource,
  runNote,
  tripBasics,
  tripBasicsLocked,
  onAnswer,
  onTripBasicsChange,
  onModeChange,
  onRemovePriority,
  onReset,
  onSearch,
  onStartInterview
}: {
  capabilities: Capabilities | null;
  dismissedPriorities: Set<string>;
  error: string;
  interviewMessages: ChatMessage[];
  interviewPhase: InterviewPhase;
  isInterviewing: boolean;
  isSearching: boolean;
  mode: SearchMode;
  profile: TravelerProfile | null;
  profileSource: string;
  runNote: string;
  tripBasics: TripBasics;
  tripBasicsLocked: boolean;
  onAnswer: (answer: string, finishRequested?: boolean) => Promise<void>;
  onTripBasicsChange: (tripBasics: TripBasics) => void;
  onModeChange: (mode: SearchMode) => void;
  onRemovePriority: (priority: string) => void;
  onReset: () => void;
  onSearch: () => void;
  onStartInterview: (tripBasics: TripBasics) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [draftTrip, setDraftTrip] = useState<TripBasics>(tripBasics);
  const [tripError, setTripError] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const confirmedProfile = interviewPhase === "confirmed" ? profile : null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [interviewMessages, isInterviewing]);

  useEffect(() => {
    setDraftTrip(tripBasics);
  }, [tripBasics]);

  function changeTripBasics(nextTrip: TripBasics) {
    setDraftTrip(nextTrip);
    if (tripBasicsLocked) onTripBasicsChange(nextTrip);
  }

  function changeMode(nextMode: SearchMode) {
    onModeChange(nextMode);
    if (nextMode !== "sample") return;
    const supportedDestination = sampleDestinations.find((destination) => (
      draftTrip.destination.toLowerCase().includes(destination.toLowerCase())
    ));
    if (!supportedDestination || draftTrip.destination !== supportedDestination) {
      changeTripBasics({ ...draftTrip, destination: supportedDestination ?? "Tokyo" });
    }
    setTripError("");
  }

  function handleTripSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = draftTrip.destination.trim();
    if (!destination) return setTripError("Choose or enter a destination.");
    if (!draftTrip.checkIn || !draftTrip.checkOut || draftTrip.checkOut <= draftTrip.checkIn) {
      return setTripError("Check-out must be after check-in.");
    }
    if (draftTrip.adults < 1 || draftTrip.rooms < 1 || draftTrip.rooms > draftTrip.adults) {
      return setTripError("Choose at least one guest and no more rooms than guests.");
    }
    if (draftTrip.budgetMax < 1) {
      return setTripError("Enter a maximum nightly budget.");
    }
    setTripError("");
    onStartInterview({ ...draftTrip, destination });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer || isInterviewing) return;
    setAnswer("");
    await onAnswer(trimmedAnswer);
  }

  async function finishInterview() {
    if (isInterviewing) return;
    setAnswer("");
    await onAnswer("That would be all.", true);
  }

  return (
    <div className="stack">
      <section className="card tripBasicsCard">
        <div className="sectionHeader">
          <div>
            <h3>Trip basics</h3>
          </div>
          {!tripBasicsLocked && <span className="miniBadge">Step 1</span>}
        </div>
        <form className="tripForm" onSubmit={handleTripSubmit}>
          <div className="modeSetup modeSetupFirst">
            <div className="sectionHeader">
              <div>
                <h3>Experience mode</h3>
                <p className="sectionSubtext">Choose before starting the conversation</p>
              </div>
              <span className={`statusDot ${mode}`} role="status" aria-label={`${mode} mode selected`} />
            </div>
            <fieldset className="modeSwitch" aria-label="Hotel search and interview mode">
              <button className={mode === "sample" ? "active" : ""} type="button" onClick={() => changeMode("sample")}>
                Sample
              </button>
              <button className={mode === "live" ? "active" : ""} type="button" onClick={() => changeMode("live")}>
                Live
              </button>
            </fieldset>
            <p className="modeStatus">
              {mode === "sample"
                ? "Choose Tokyo, Copenhagen, or Paris with bundled hotel data."
                : capabilities?.serpApiConfigured && capabilities?.openaiConfigured
                  ? `Enter any destination · SerpApi + ${capabilities.model}`
                  : "Enter any destination. Live requires server-side OpenAI and SerpApi keys."}
            </p>
          </div>
          <div className="fieldGroup destinationField">
            <span id="destination-label"><MapPin size={15} /> City or country</span>
            {mode === "sample" ? (
              <select
                aria-labelledby="destination-label"
                value={draftTrip.destination}
                onChange={(event) => changeTripBasics({ ...draftTrip, destination: event.target.value })}
              >
                {sampleDestinations.map((destination) => <option key={destination} value={destination}>{destination}</option>)}
              </select>
            ) : (
              <>
                <input
                  aria-labelledby="destination-label"
                  list="destination-suggestions"
                  placeholder="Enter any city or country"
                  value={draftTrip.destination}
                  onChange={(event) => changeTripBasics({ ...draftTrip, destination: event.target.value })}
                />
                <datalist id="destination-suggestions">
                  <option value="Tokyo, Japan" />
                  <option value="Copenhagen, Denmark" />
                  <option value="Paris, France" />
                  <option value="London, United Kingdom" />
                  <option value="New York, United States" />
                  <option value="Singapore" />
                  <option value="Seoul, South Korea" />
                  <option value="Bangkok, Thailand" />
                  <option value="Sydney, Australia" />
                  <option value="Dubai, United Arab Emirates" />
                  <option value="Rome, Italy" />
                  <option value="Barcelona, Spain" />
                </datalist>
              </>
            )}
          </div>
          <div className="fieldPair">
            <label className="fieldGroup">
              <span><CalendarDays size={15} /> Check-in</span>
              <input
                aria-label="Check-in"
                type="date"
                value={draftTrip.checkIn}
                onChange={(event) => changeTripBasics({ ...draftTrip, checkIn: event.target.value })}
              />
            </label>
            <label className="fieldGroup">
              <span><CalendarDays size={15} /> Check-out</span>
              <input
                aria-label="Check-out"
                min={draftTrip.checkIn}
                type="date"
                value={draftTrip.checkOut}
                onChange={(event) => changeTripBasics({ ...draftTrip, checkOut: event.target.value })}
              />
            </label>
          </div>
          <div className="fieldPair">
            <label className="fieldGroup compactField">
              <span><UsersRound size={15} /> Guests</span>
              <input
                aria-label="Number of guests"
                min="1"
                type="number"
                value={draftTrip.adults}
                onChange={(event) => changeTripBasics({ ...draftTrip, adults: Number(event.target.value) })}
              />
            </label>
            <label className="fieldGroup compactField">
              <span><BedDouble size={15} /> Rooms</span>
              <input
                aria-label="Number of rooms"
                max={draftTrip.adults}
                min="1"
                type="number"
                value={draftTrip.rooms}
                onChange={(event) => changeTripBasics({ ...draftTrip, rooms: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="fieldPair">
            <label className="fieldGroup compactField">
              <span><BedDouble size={15} /> Stay type</span>
              <select
                aria-label="Accommodation type"
                value={draftTrip.accommodationType}
                onChange={(event) => changeTripBasics({
                  ...draftTrip,
                  accommodationType: event.target.value as TripBasics["accommodationType"]
                })}
              >
                <option value="hotel">Hotels only</option>
                <option value="hostel">Hostels only</option>
                <option value="any">Any stay type</option>
              </select>
            </label>
            <label className="fieldGroup compactField">
              <span><Star size={15} /> Minimum rating</span>
              <select
                aria-label="Minimum aggregate rating"
                value={draftTrip.minimumRating}
                onChange={(event) => changeTripBasics({ ...draftTrip, minimumRating: Number(event.target.value) })}
              >
                <option value="0">Any rating</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </label>
          </div>
          <div className="budgetFields">
            <label className="fieldGroup compactField">
              <span className="budgetLabel"><CircleDollarSign size={15} /> Maximum budget per room per night (USD)</span>
              <input
                aria-label="Maximum nightly budget"
                min="1"
                type="number"
                value={draftTrip.budgetMax}
                onChange={(event) => changeTripBasics({ ...draftTrip, budgetMax: Number(event.target.value) })}
              />
            </label>
          </div>
          {tripError && <p className="fieldError">{tripError}</p>}
          {!tripBasicsLocked && (
            <button className="secondaryButton" type="submit">
              Tell us what you need <ArrowRight size={17} />
            </button>
          )}
        </form>
      </section>

      {tripBasicsLocked && <section className="card interviewCard">
        <div className="sectionHeader">
          <div>
            <h3>Tell us what you need</h3>
            <p className="sectionSubtext">{profileSource === "openai" ? "Concierge live" : "Private concierge"}</p>
          </div>
          <div className="interviewActions">
            <span className={`miniBadge phaseBadge ${interviewPhase}`}>
              {interviewPhase === "confirmed"
                ? "confirmed"
                : interviewPhase === "final_check"
                  ? "final check"
                  : `${interviewMessages.filter((message) => message.role === "user").length} answers`}
            </span>
            {interviewMessages.length > 1 && (
              <button className="softIcon" type="button" aria-label="Reset trip requirements" onClick={onReset}>
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="chatList chatTranscript" aria-live="polite">
          {interviewMessages.map((message, index) => (
            <div className={`bubble ${message.role === "assistant" ? "ai" : "user"}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" && <span className="bubbleAvatar">C</span>}
              <p>{message.content}</p>
            </div>
          ))}
          {isInterviewing && (
            <div className="bubble ai thinkingBubble">
              <span className="bubbleAvatar">C</span>
              <LoaderCircle className="spin" size={18} />
              <p>Reviewing your trip...</p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        {error && <p className="errorNote">{error}</p>}
        {interviewPhase === "confirmed" && (
          <div className="confirmedNote">
            <Check size={17} />
            Requirements confirmed. You can add more at any time.
          </div>
        )}
        <form className="chatComposer" onSubmit={handleSubmit}>
          <input
            aria-label="Your trip requirement"
            disabled={isInterviewing}
            placeholder={
              interviewPhase === "confirmed"
                ? "Add another requirement..."
                : interviewPhase === "final_check"
                  ? "Add something, or say no more"
                  : "Tell us what matters for this trip..."
            }
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
          <button aria-label="Send requirement" disabled={!answer.trim() || isInterviewing} type="submit">
            {isInterviewing ? <LoaderCircle className="spin" size={18} /> : <SendHorizontal size={18} />}
          </button>
        </form>
        {interviewPhase !== "confirmed" && interviewMessages.some((message) => message.role === "user") && (
          <button className="finishInterviewButton" disabled={isInterviewing} onClick={finishInterview} type="button">
            <Check size={16} /> Finish interview
          </button>
        )}
      </section>}

      {confirmedProfile ? (
        <>
          <section className="card">
            <div className="sectionHeader">
              <div>
                <h3>Risk priorities</h3>
                <p className="sectionSubtext">Trip conversation + saved profile</p>
              </div>
              <span className="miniBadge">combined</span>
            </div>
            <div className="chipGrid">
              {summarizePriorities(confirmedProfile, interviewMessages)
                .filter((risk) => !dismissedPriorities.has(risk))
                .map((risk) => (
                  <button
                    aria-label={`Remove ${risk}`}
                    className="chip removableChip"
                    key={risk}
                    onClick={() => onRemovePriority(risk)}
                    type="button"
                  >
                    {risk}
                    <X size={13} />
                  </button>
                ))}
            </div>
          </section>

          <button className="primaryButton" type="button" onClick={onSearch} disabled={isSearching}>
            {isSearching ? "Running search..." : mode === "live" ? "Search live hotels" : "Search sample hotels"}
            {isSearching ? <Sparkles size={18} /> : <ArrowRight size={18} />}
          </button>
          <p className="runNote">{runNote}</p>
        </>
      ) : (
        <p className="interviewGate">
          {tripBasicsLocked ? "Confirm this trip's requirements to unlock hotel search." : "Set trip basics to tell us what you need."}
        </p>
      )}
    </div>
  );
}

type CorePreferenceKey = "valueForMoney" | "reviewScore" | "quiet" | "location";

const preferenceFields: Array<{
  key: CorePreferenceKey;
  label: string;
  description: string;
}> = [
  { key: "valueForMoney", label: "Value for money", description: "Balance comfort with a sensible price" },
  { key: "reviewScore", label: "Rating", description: "Prioritize aggregate ratings across booking sites" },
  { key: "quiet", label: "Quiet", description: "Reduce street, hallway, and nightlife noise" },
  { key: "location", label: "Location", description: "Prioritize convenient, well-positioned hotels" }
];

function UserProfileScreen({
  preferences,
  saved,
  onSave
}: {
  preferences: UserPreferences;
  saved: boolean;
  onSave: (preferences: UserPreferences) => void;
}) {
  const [draft, setDraft] = useState(preferences);
  const [newPreference, setNewPreference] = useState("");

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  function addCustomPreferences() {
    const labels = parseCustomPreferenceLabels(newPreference);
    if (labels.length === 0) return;
    const existing = new Map(draft.customPriorities.map((item) => [item.label.toLowerCase(), item]));
    for (const label of labels) {
      if (!existing.has(label.toLowerCase())) existing.set(label.toLowerCase(), { label, score: 4 });
    }
    const customPriorities = [...existing.values()];
    setDraft({ ...draft, customPriorities, notes: customPriorities.map((item) => item.label).join(", ") });
    setNewPreference("");
  }

  function removeCustomPreference(label: string) {
    const customPriorities = draft.customPriorities.filter((item) => item.label !== label);
    setDraft({ ...draft, customPriorities, notes: customPriorities.map((item) => item.label).join(", ") });
  }

  return (
    <div className="stack profileStack">
      <div className="profileIdentity" role="img" aria-label="Traveler profile">
        <span className="profileAvatar"><UserRound size={25} /></span>
      </div>

      <section className="card preferenceCard">
        <div className="sectionHeader">
          <div>
            <h3>What you value</h3>
            <p className="sectionSubtext">Saved privately on this device</p>
          </div>
          <span className={`miniBadge saveBadge ${saved ? "saved" : ""}`}>{saved ? "saved" : "1-5"}</span>
        </div>

        <div className="preferenceList">
          {preferenceFields.map((field) => (
            <label className="preferenceRow" key={field.key}>
              <span className="preferenceHeading">
                <span>
                  <strong>{field.label}</strong>
                  <small>{field.description}</small>
                </span>
                <b>{draft[field.key]}</b>
              </span>
              <input
                aria-label={`${field.label} priority`}
                max="5"
                min="1"
                type="range"
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: Number(event.target.value) })}
                onInput={(event) => setDraft({ ...draft, [field.key]: Number(event.currentTarget.value) })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card notesCard">
        <div className="fieldGroup">
          <span>Anything that is almost always important?</span>
          <div className="customPreferenceComposer">
            <input
              aria-label="New long-term preference"
              placeholder="For example: firm mattress"
              value={newPreference}
              onChange={(event) => setNewPreference(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomPreferences();
                }
              }}
            />
            <button className="softIcon" type="button" aria-label="Add long-term preference" onClick={addCustomPreferences} disabled={!newPreference.trim()}>
              <Plus size={17} />
            </button>
          </div>
        </div>

        {draft.customPriorities.length > 0 && (
          <div className="preferenceList customPreferenceList">
            {draft.customPriorities.map((preference) => (
              <div className="preferenceRow" key={preference.label}>
                <span className="preferenceHeading">
                  <strong>{preference.label}</strong>
                  <span className="customPreferenceActions">
                    <b>{preference.score}</b>
                    <button className="removePreference" type="button" aria-label={`Remove ${preference.label}`} onClick={() => removeCustomPreference(preference.label)}>
                      <X size={15} />
                    </button>
                  </span>
                </span>
                <input
                  aria-label={`${preference.label} priority`}
                  max="5"
                  min="1"
                  type="range"
                  value={preference.score}
                  onChange={(event) => {
                    const score = Number(event.target.value);
                    setDraft({
                      ...draft,
                      customPriorities: draft.customPriorities.map((item) => item.label === preference.label ? { ...item, score } : item)
                    });
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <button className="primaryButton" type="button" onClick={() => onSave(draft)}>
        {saved ? "Preferences saved" : "Save profile preferences"}
        {saved ? <Check size={18} /> : <Save size={18} />}
      </button>
    </div>
  );
}

function ResultsScreen({
  dataSource,
  error,
  excludedHotels,
  hotels,
  profile,
  recommendations,
  isAnalyzingMore,
  remainingCount,
  runNote,
  selectedId,
  onAnalyzeMore,
  onSelect
}: {
  dataSource: string;
  error: string;
  excludedHotels: HotelCandidate[];
  hotels: HotelCandidate[];
  profile: TravelerProfile;
  recommendations: HotelRecommendation[];
  isAnalyzingMore: boolean;
  remainingCount: number;
  runNote: string;
  selectedId: string;
  onAnalyzeMore: () => void;
  onSelect: (id: string) => void;
}) {
  const initialCandidateCount = recommendations.length + excludedHotels.length + remainingCount;

  function exclusionReason(hotel: HotelCandidate): string {
    const hardConflicts = getHotelDealBreakerConflicts(hotel, profile);
    if (hardConflicts.length > 0) return hardConflicts.join(", ");
    if (filterHotelsByAccommodationType([hotel], profile.accommodationType).length === 0) {
      const evidence = [
        hotel.propertyType ?? "",
        ...hotel.amenities,
        ...(hotel.excludedAmenities ?? []),
        ...hotel.reviewSnippets,
        ...(hotel.lowScoreReviewIssues ?? [])
      ].join(" ");
      if (/shared bathroom|shared toilet|communal bathroom|communal toilet|shared facilities/i.test(evidence)) {
        return "Shared bathroom or toilet";
      }
      return "Stay type does not match your selection";
    }
    return "Conflicts with a hard trip requirement";
  }

  return (
    <div className="stack">
      <section className="searchCard">
        <div>
          <h2>{recommendations.length} verified {recommendations.length === 1 ? "match" : "matches"}</h2>
          <p className="searchSummary">
            {profile.destination} · {profile.dates} · {profile.adults} {profile.adults === 1 ? "guest" : "guests"} · {profile.rooms} {profile.rooms === 1 ? "room" : "rooms"} · {profile.budget}
          </p>
          <p className="searchCriteria">
            {profile.accommodationType === "hotel" ? "Hotels only" : profile.accommodationType === "hostel" ? "Hostels only" : "Any stay type"}
            {profile.minimumRating > 0 ? ` · ${profile.minimumRating.toFixed(1)}+ rating` : " · Any rating"}
          </p>
          <p className="candidateBreakdown">
            {initialCandidateCount} initial candidates
            {excludedHotels.length > 0 ? ` · ${excludedHotels.length} removed` : ""}
            {remainingCount > 0 ? ` · ${remainingCount} awaiting review` : ""}
          </p>
          {dataSource !== "serpapi" && (
            <p className="snapshotNote">Official hotel facts · local snapshot 2026-07-20 · demo prices</p>
          )}
          <p className="runNote inline">{runNote}</p>
        </div>
        <button className="iconButton" type="button" aria-label="Filters">
          <SlidersHorizontal size={19} />
        </button>
      </section>

      {error && <p className="errorNote">{error}</p>}

      <section className="card">
        <div className="sectionHeader">
          <h3>Personal fit ranking</h3>
          <span className="miniBadge">Personal analysis</span>
        </div>
        <div className="hotelList">
          {recommendations.map((recommendation) => (
            <HotelCard
              hotel={getHotel(recommendation.hotelId, hotels)}
              isSelected={selectedId === recommendation.hotelId}
              key={recommendation.hotelId}
              minimumRating={profile.minimumRating}
              recommendation={recommendation}
              onSelect={() => onSelect(recommendation.hotelId)}
            />
          ))}
        </div>
        {remainingCount > 0 && (
          <button className="analyzeMoreButton" disabled={isAnalyzingMore} onClick={onAnalyzeMore} type="button">
            {isAnalyzingMore ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
            {isAnalyzingMore ? "Analyzing more hotels..." : `Analyze ${Math.min(ADDITIONAL_RESEARCH_BATCH_SIZE, remainingCount)} more hotels`}
          </button>
        )}
        {excludedHotels.length > 0 && (
          <details className="excludedHotels">
            <summary>{excludedHotels.length} removed after review verification</summary>
            <div className="excludedHotelList">
              {excludedHotels.map((hotel) => (
                <div className="excludedHotelRow" key={hotel.id}>
                  <strong>{hotel.name}</strong>
                  <span>{exclusionReason(hotel)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

function DetailsScreen({
  hotel,
  recommendation
}: {
  hotel: HotelCandidate;
  recommendation: HotelRecommendation;
}) {
  const priceOffers = hotel.priceOffers ?? [getLowestPriceOffer(hotel)];

  return (
    <div className="stack lensStack">
      <section className="sheetHandle" aria-hidden="true">
        <span />
      </section>

      <section className="card lensHero">
        <img src={hotel.imageUrl} alt={`${hotel.name} room`} />
        <div>
          <p className="eyebrow">Hotel Details</p>
          <h2>{hotel.name}</h2>
          <p>{hotel.area}</p>
        </div>
      </section>

      <section className="aiNote">
        <span className="bubbleAvatar">C</span>
        <p>{recommendation.detailSummary}</p>
      </section>

      {recommendation.researchSources && recommendation.researchSources.length > 0 && (
        <div className="researchSourceBlock">
          {recommendation.researchedAt && (
            <p className="researchMeta">Review profile updated {new Date(recommendation.researchedAt).toLocaleDateString()}</p>
          )}
          <nav className="researchSources" aria-label="Research sources">
            {recommendation.researchSources.map((source) => (
              <a className="sourceLink" href={source.url} key={source.url} rel="noreferrer" target="_blank">
                {source.title} <ExternalLink size={14} />
              </a>
            ))}
          </nav>
        </div>
      )}

      {hotel.sourceUrl && (
        <a className="sourceLink" href={hotel.sourceUrl} rel="noreferrer" target="_blank">
          Official hotel source <ExternalLink size={15} />
        </a>
      )}

      <section className="card priceComparison">
        <div className="sectionHeader">
          <div>
            <h3>Prices by platform</h3>
            <p className="sectionSubtext">Per room, per night</p>
          </div>
          <span className="miniBadge">{priceOffers.length} offers</span>
        </div>
        <div className="priceOfferList">
          {priceOffers.map((offer) => (
            <a href={offer.url} key={`${offer.provider}-${offer.price}`} rel="noreferrer" target="_blank">
              <span>{offer.provider}</span>
              <strong>{offer.price}</strong>
              <ExternalLink size={15} />
            </a>
          ))}
        </div>
        {hotel.dataNote && <p className="priceNote">Sample prices are demo estimates; confirm the final rate on the platform.</p>}
      </section>

      <section className="card">
        <div className="sectionHeader">
          <h3>Evidence themes</h3>
          <span className={`confidence ${recommendation.reviewLens.confidence}`}>
            {recommendation.reviewLens.confidence} confidence
          </span>
        </div>
        <ThemeGroup title="Positive" items={recommendation.reviewLens.positiveThemes} />
        <ThemeGroup title="Watch-outs" items={recommendation.reviewLens.negativeThemes} />
        <ThemeGroup title="Specific for you" items={recommendation.reviewLens.travelerSpecificFlags} />
      </section>

    </div>
  );
}

function HotelCard({
  hotel,
  recommendation,
  isSelected,
  minimumRating,
  onSelect
}: {
  hotel: HotelCandidate;
  recommendation: HotelRecommendation;
  isSelected: boolean;
  minimumRating: number;
  onSelect: () => void;
}) {
  const lowestOffer = getLowestPriceOffer(hotel);
  const comparableRating = getComparableRating(hotel);
  return (
    <button className={`hotelCard ${isSelected ? "selectedHotel" : ""}`} type="button" onClick={onSelect}>
      <img src={hotel.imageUrl} alt={`${hotel.name} room`} />
      <span className={`score ${scoreTone(recommendation.fitScore)}`}>{recommendation.fitScore}</span>
      <div className="hotelBody">
        <div>
          <h4>{hotel.name}</h4>
          <p>{hotel.area}</p>
        </div>
        <div className="hotelMeta">
          <span>
            <Star size={14} fill="currentColor" />
            {comparableRating > 0 ? `${comparableRating.toFixed(1)}/5` : "Not rated"}
          </span>
          <span>{lowestOffer.price}/night</span>
        </div>
        <div className="hotelFooter">
          <span>{recommendation.fitLabel}</span>
          <strong>{lowestOffer.provider}</strong>
        </div>
        {hotel.ratingBelowPreference && (
          <span className="ratingMiss">Below your {minimumRating.toFixed(1)} rating minimum</span>
        )}
      </div>
    </button>
  );
}

function ThemeGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="themeGroup">
      <h4>{title}</h4>
      <div className="chipGrid">
        {items.map((item) => (
          <span className="chip" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
