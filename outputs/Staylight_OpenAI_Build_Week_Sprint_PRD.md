# Staylight OpenAI Build Week Sprint PRD

Date: 2026-07-18  
Hackathon: OpenAI Build Week  
Submission deadline: 2026-07-21 5:00 PM PT / 2026-07-22 2:00 AM Copenhagen  
Primary track: Apps for Your Life  
Backup track: Work & Productivity

## 1. Product One-Liner

Staylight is an AI hotel risk lens that interviews travelers, searches real hotel options, and explains which stays fit their personal needs using evidence from prices, amenities, location signals, and review themes.

## 2. Problem

Hotel booking is not just price comparison. Travelers often need to answer highly personal questions:

- Will this hotel be quiet enough for a light sleeper?
- Is it safe and convenient for a solo traveler arriving late?
- Is the room actually suitable for a family, remote work, or mobility needs?
- Are negative reviews relevant to me, or just noise?
- Which platform has the best current offer for this hotel?

Existing travel products mostly rank by price, rating, location, or sponsored placement. They do not understand the traveler's situation deeply enough, and they rarely explain recommendation risks in a way a real person can trust.

## 3. Target User

Primary users:

- Independent travelers planning high-stakes stays, such as solo trips, family trips, long stays, remote work trips, and first-time visits to unfamiliar cities.
- Users who feel overwhelmed by hotel tabs, booking platforms, review sites, and conflicting ratings.
- Users who has very specific need for hotels and usually go over reviews from multiple hotel platform to decide

Initial demo persona:

- Solo traveler going to copenhagen for 5 nights.
- Wants a safe, quiet hotel near transit.
- Budget-conscious but willing to pay more for location and sleep quality.
- Worried about tiny rooms, noisy nightlife streets, and weak Wi-Fi.

## 4. Product Goal

Build a working prototype that proves the following loop:

1. Staylight asks useful follow-up questions like a travel advisor.
2. The user confirms a complete travel profile.
3. Staylight searches real hotel data.
4. Staylight ranks hotels by personal fit, not just generic score.
5. Staylight explains review themes, user-specific risks, tradeoffs, and confidence.

## 5. MVP Scope

### Must Have

- Mobile-first web app.
- Multi-turn intake flow that gathers:
  - Destination
  - Dates or flexible date assumptions
  - Party type
  - Budget
  - Must-haves
  - Deal-breakers
  - Traveler style
  - Safety, noise, commute, room-size, and Wi-Fi concerns
- Explicit "profile confirmation" step before search.
- Hotel search endpoint using server-side `SERPAPI_API_KEY`.
- AI recommendation endpoint using server-side `OPENAI_API_KEY`.
- Hotel cards with:
  - Hotel name
  - Rating
  - Price when available
  - Booking providers when available
  - Why it fits
  - Risks for this traveler
  - Confidence level
- Review Lens section with:
  - Positive themes
  - Negative themes
  - Traveler-specific risk flags
  - Evidence notes
  - Data limitations
- Sample-data mode so judges can test locally without paying for SerpApi.
- Clear README with local setup.

### Should Have

- Export/share a short decision report.
- "Compare top 3" view.
- Search cache for repeated demo queries.
- Demo mode toggle: `LIVE_DATA` vs `SAMPLE_DATA`.
- Error states for missing keys, quota limits, or sparse hotel data.

### Out Of Scope For Hackathon

- User accounts.
- Payment.
- Full booking checkout.
- Scraping every review from Booking, Agoda, and Trip.com.
- Background itinerary planning.
- Multi-city trip planning.
- Production-grade anti-abuse system.

## 6. Differentiation

Staylight should not compete as a generic hotel search UI. The winning angle is:

> Search engines show options. Staylight explains personal fit and risk.

Key differentiators:

- Starts with traveler context instead of filters.
- Waits for profile confirmation before search.
- Uses real hotel data where available.
- Converts hotel/review signals into personalized risk analysis.
- Admits uncertainty when review or provider data is incomplete.
- Keeps API keys server-side for the production architecture.
- Offers a local run path for privacy-conscious users and judges.

## 7. User Journey

### Step 1: Intake

The user lands directly in the advisor interface. Staylight asks natural follow-up questions, one screen at a time.

Example prompts:

- "Who is traveling, and what would make this stay feel successful?"
- "What are your non-negotiables?"
- "What are you worried might go wrong with the hotel?"
- "Would you rather save money or reduce uncertainty?"

### Step 2: Profile Confirmation

Staylight summarizes:

- Trip
- Budget
- Must-haves
- Deal-breakers
- Risk priorities
- Ranking logic

The user confirms before search.

### Step 3: Search

The backend calls SerpApi Google Hotels with destination and date parameters, or uses sample data if live keys are unavailable.

### Step 4: AI Fit Analysis

The backend sends normalized hotel data plus user profile to GPT-5.6 and requests structured JSON:

- Fit score
- Reasons
- Risks
- Review themes
- Confidence
- Suggested best user type
- Questions the traveler should verify before booking

### Step 5: Decision View

The frontend shows:

- Top match
- Good alternatives
- Watch-outs
- Provider availability
- Confidence labels
- Transparent data limitations

## 8. Technical Specification

### Recommended Stack

- Framework: Next.js App Router
- Language: TypeScript
- UI: React + CSS modules or Tailwind
- AI: OpenAI Responses API or Chat Completions equivalent available in the current SDK
- Hotel data: SerpApi Google Hotels
- Runtime: Node.js
- Deployment: public demo plus local run

### Environment Variables

```bash
OPENAI_API_KEY=
SERPAPI_API_KEY=
NEXT_PUBLIC_DEMO_MODE=sample
```

Rules:

- `OPENAI_API_KEY` must only be read server-side.
- `SERPAPI_API_KEY` must only be read server-side.
- No API key should be stored in localStorage, sessionStorage, browser cookies, or client-visible config.
- `.env.local` must be gitignored.
- `.env.example` should be committed.

### API Routes

#### `POST /api/profile`

Purpose: update or summarize the travel profile from conversation turns.

Input:

```json
{
  "messages": [
    { "role": "user", "content": "I am going to Tokyo alone for 5 nights..." }
  ],
  "currentProfile": {}
}
```

Output:

```json
{
  "profile": {
    "destination": "Tokyo",
    "dates": "flexible or specified",
    "party": "solo traveler",
    "budget": "mid-range",
    "mustHaves": ["quiet", "near transit", "safe late arrival"],
    "dealBreakers": ["party street", "weak Wi-Fi"],
    "riskPriorities": ["noise", "location safety", "room size"]
  },
  "nextQuestion": "Do you care more about being near nightlife or a quieter residential area?",
  "readyForConfirmation": false
}
```

#### `POST /api/hotels/search`

Purpose: fetch hotel candidates.

Input:

```json
{
  "profile": {
    "destination": "Tokyo",
    "checkIn": "2026-09-15",
    "checkOut": "2026-09-20",
    "adults": 1,
    "budget": "mid-range"
  },
  "mode": "live"
}
```

Output:

```json
{
  "source": "serpapi",
  "hotels": [
    {
      "name": "Example Hotel",
      "rating": 4.3,
      "price": "$142",
      "providers": ["Booking.com", "Trip.com"],
      "amenities": ["Free Wi-Fi", "Near transit"],
      "reviewsSummary": "Guests mention clean rooms and convenient location..."
    }
  ],
  "limitations": ["Provider coverage varies by hotel and query."]
}
```

#### `POST /api/hotels/analyze`

Purpose: rank hotels against traveler profile.

Input:

```json
{
  "profile": {},
  "hotels": []
}
```

Output:

```json
{
  "recommendations": [
    {
      "hotelName": "Example Hotel",
      "fitScore": 87,
      "fitLabel": "Strong fit",
      "whyItFits": ["Near transit", "Consistent cleanliness signals"],
      "risks": ["Rooms may be small", "Some noise complaints"],
      "reviewLens": {
        "positiveThemes": ["Location", "Cleanliness"],
        "negativeThemes": ["Room size", "Street noise"],
        "travelerSpecificFlags": ["Light sleeper should request high floor"],
        "confidence": "medium"
      },
      "verifyBeforeBooking": ["Confirm room size", "Check cancellation policy"]
    }
  ]
}
```

### Data Flow

```text
User conversation
  -> /api/profile
  -> confirmed structured traveler profile
  -> /api/hotels/search
  -> normalized hotel candidates
  -> /api/hotels/analyze
  -> personalized ranking and risk lens
  -> decision UI
```

### Sample Data Mode

Include `data/sample-hotels-tokyo.json` with 6 to 8 realistic hotel objects.

Sample mode should:

- Require no SerpApi key.
- Still use OpenAI if available.
- Fall back to deterministic analysis text if OpenAI key is missing.
- Let judges run the app immediately after install.

### Security Notes

- Keep all infrastructure keys server-side.
- Add request validation for destination, dates, and party size.
- Add basic rate limiting for public demo if possible.
- Never expose raw environment variables to the client.
- Show clear errors when keys are missing.

## 9. UI Specification

### Layout

Mobile-first, travel-advisor feel, no marketing landing page.

Primary screens:

- Conversation intake
- Profile confirmation
- Search progress
- Results
- Hotel detail / Review Lens

### Components

- Chat-style question card
- Profile summary panel
- Confirmation button
- Hotel result card
- Fit score badge
- Risk badges
- Review Lens panel
- Provider chips
- Confidence label
- Data limitation notice

### Tone

Warm, direct, and decision-oriented. Avoid sounding like a generic travel blog.

Example copy:

- "Best fit for your sleep and transit priorities"
- "Good option, but verify room size before booking"
- "Review evidence is thin here, so confidence is medium"

## 10. GPT-5.6 / Codex Story For Judges

Use this angle in README and demo:

> Codex helped design and implement the end-to-end product loop: converting a broad travel idea into a working app, shaping the traveler-profile schema, building server-side API boundaries, creating sample data mode, and tightening the interface for a judge-friendly demo. GPT-5.6 powers the traveler interview and the hotel risk analysis, turning messy hotel signals into personalized explanations.

Where GPT-5.6 is used in-product:

- Generate follow-up questions from incomplete traveler needs.
- Convert conversational answers into structured profile fields.
- Analyze hotel candidates against the traveler's priorities.
- Summarize review themes and risks.
- Generate verification questions before booking.

Where Codex is used in build workflow:

- Product scoping and PRD creation.
- API and data model design.
- Implementation of frontend and backend routes.
- README and submission material drafting.
- Testing and demo-script preparation.

## 11. Demo Video Script Under 3 Minutes

### 0:00-0:20 Problem

"Hotel search gives ratings and prices, but travelers make decisions based on personal risks: noise, safety, commute, room size, Wi-Fi, and who they are traveling with. Staylight is an AI hotel risk lens that explains which hotel actually fits you."

### 0:20-0:55 Intake

Show the user entering:

"I am traveling solo to Tokyo for five nights. I want somewhere safe, quiet, near transit, with good Wi-Fi. I am worried about tiny rooms and noisy nightlife streets."

Show Staylight asking one or two follow-up questions.

### 0:55-1:20 Profile Confirmation

Show the summarized traveler profile and press confirm.

### 1:20-2:10 Results

Show top 3 hotels with fit score, price/provider data, why it fits, and risks.

### 2:10-2:40 Review Lens

Open one hotel. Show positive themes, negative themes, traveler-specific warnings, confidence, and what to verify before booking.

### 2:40-3:00 Build Explanation

"The app uses server-side keys for OpenAI and SerpApi. GPT-5.6 powers the interview and hotel risk analysis. Codex helped build the app, API structure, sample-data mode, README, and demo workflow."

## 12. 72 Hour Sprint Plan

### Day 1: 2026-07-18

Goal: lock scope and get a runnable MVP shell.

Tasks:

- Finalize PRD and technical spec.
- Create or organize GitHub repo.
- Set up Next.js app structure.
- Add `.env.example` and `.gitignore`.
- Implement mobile-first shell.
- Implement static conversation intake UI.
- Define TypeScript types:
  - `TravelerProfile`
  - `HotelCandidate`
  - `HotelRecommendation`
  - `ReviewLens`
- Add sample Tokyo hotel data.
- Implement sample-mode result rendering.

Acceptance criteria:

- App runs locally.
- User can go from intake to profile confirmation.
- Results page can render sample hotels.

### Day 2: 2026-07-19

Goal: make the core AI and data loop work.

Tasks:

- Implement `/api/profile`.
- Implement `/api/hotels/search`.
- Implement SerpApi adapter with server-side key.
- Implement `/api/hotels/analyze`.
- Add OpenAI structured output for recommendation JSON.
- Add deterministic fallback for missing OpenAI key.
- Add error handling for missing keys and quota failures.
- Add Review Lens UI.
- Add confidence and limitations copy.
- Test sample mode and live mode.

Acceptance criteria:

- App can search or load candidates.
- App can produce personalized hotel fit analysis.
- No client bundle exposes API keys.

### Day 3: 2026-07-20

Goal: polish, document, and prepare submission.

Tasks:

- Improve responsive UI.
- Add loading and empty states.
- Add compare top 3 view if time allows.
- Add README:
  - What it does
  - How to run locally
  - Environment variables
  - Sample mode
  - Live mode
  - How Codex and GPT-5.6 were used
- Add screenshots.
- Deploy public demo or prepare local-only judging instructions.
- Run final local test from clean install.
- Draft Devpost description.
- Draft demo video script.

Acceptance criteria:

- A judge can run the project locally from README.
- Public demo works or testing instructions are clear.
- README tells the Codex/GPT-5.6 story.

### Final Submission Buffer: 2026-07-21

Goal: submit before the deadline.

Tasks:

- Record demo video under 3 minutes.
- Upload public YouTube video.
- Get `/feedback` Codex Session ID.
- Confirm repo visibility or private sharing:
  - `testing@devpost.com`
  - `build-week-event@openai.com`
- Fill Devpost fields:
  - Submitter type
  - Country of residence
  - Category
  - Repo URL
  - Testing instructions
  - Feedback session ID
  - Video URL
- Verify submission is not left as draft.

## 13. Devpost Draft Copy

### Project Name

Staylight

### Tagline

AI hotel recommendations that explain personal fit, risk, and review evidence.

### Short Description

Staylight interviews travelers before searching, then ranks hotel options by personal fit rather than generic rating. It uses GPT-5.6 to turn traveler needs, hotel data, and review signals into clear recommendations, risks, confidence levels, and verification questions.

### What It Does

Staylight helps travelers choose hotels with less uncertainty. Instead of starting with filters, it asks about the traveler's trip, priorities, worries, and deal-breakers. After the traveler confirms their profile, Staylight searches hotel options and analyzes each result against the user's needs. The final output explains why a hotel fits, what risks matter, what review themes suggest, and what the traveler should verify before booking.

### How We Built It

We built Staylight as a mobile-first web app with server-side API routes for hotel search and AI analysis. SerpApi provides hotel data where available, while GPT-5.6 powers the traveler interview, profile structuring, and personalized hotel risk analysis. The project includes a sample-data mode so judges can run it locally without external API spend, and live mode for real hotel search with server-side environment variables.

### How We Used Codex

Codex helped scope the product, create the PRD, design the data model and API boundaries, implement the app workflow, improve the README, and prepare the demo path. It was especially useful for turning a broad travel-assistant idea into a testable hackathon product with a clear user journey and submission-ready documentation.

### Challenges

The hardest part was making hotel recommendations transparent instead of generic. Hotel data can be incomplete, provider availability varies, and review signals are uneven. We designed Staylight to state limitations clearly and attach confidence levels to recommendations instead of pretending every result has perfect evidence.

### What Is Next

Next steps include deeper review ingestion, richer evidence citations, multi-platform provider comparison, saved traveler profiles, collaborative trip planning, and stronger ranking models for different traveler types.

## 14. Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Public demo requires sign-in | Judges cannot test | Provide public deployment or local run path |
| SerpApi quota issues | Live data fails | Sample-data mode |
| OpenAI key missing | AI analysis fails | Clear error plus deterministic fallback |
| Review data sparse | Weak differentiation | Explicit confidence and limitations |
| Demo too long | Judges miss value | Script under 3 minutes |
| Scope creep | App unfinished | Focus on one city demo and top 3 results |

## 15. Definition Of Done

The hackathon version is done when:

- The app runs locally from README.
- Sample-data mode works without paid keys.
- Live mode supports server-side OpenAI and SerpApi keys.
- A traveler can complete intake, confirm profile, view recommendations, and open Review Lens.
- README explains setup and Codex/GPT-5.6 usage.
- Demo video is under 3 minutes and publicly accessible.
- Devpost submission has repo URL, video URL, testing instructions, category, and `/feedback` session ID.

