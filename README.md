# Staylight

Personal hotel recommendations that explain fit, risk, and review evidence.

Staylight remembers stable hotel preferences, gathers requirements specific to each trip, then ranks hotel candidates by personal fit instead of generic score. Its reusable hotel review profiles make each completed research run useful for future searches.

## Project Logic

See [`docs/PROJECT_LOGIC.md`](docs/PROJECT_LOGIC.md) for the current end-to-end architecture, data flow, filtering and research stages, candidate states, cache behavior, failure handling, and module map.

## What It Does

- Stores long-term preferences such as value, aggregate guest rating, quiet, location, and user-created weighted priorities locally on the device.
- Collects only trip-specific requirements through a multi-turn concierge conversation.
- Reads destination, check-in, check-out, and nightly budget directly from structured inputs instead of asking the LLM to infer them.
- Accepts any city or country in Live mode while keeping Tokyo, Copenhagen, and Paris available for offline Sample mode.
- Requires an explicit "nothing else" answer at the final check before unlocking search.
- Searches hotel candidates through local hotel snapshots or SerpApi live mode.
- Applies strict budget, accommodation type, rating, and explicit deal-breaker filters before review research.
- Selects an initial 18-hotel shortlist with area and price diversity, builds or reuses review profiles, then applies deterministic personalized ranking.
- Provides Hotel Details with a concise personalized summary, recurring low-score review issues, evidence confidence, and platform prices.
- Stores reusable hotel profiles locally for 30 days by default, including aspect evidence, recurring issues, source links, confidence, and research time.
- Supports researching 12 additional hotels per round without discarding or restarting the existing ranking.
- Keeps API keys server-side in local environment variables.
- Runs in sample mode without paid keys.

## Local Setup

Use Node.js 22 LTS (Node.js 20–23 is supported). Then run:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

For a one-command local start on macOS or Linux:

```bash
./start-local.sh
```

This starts Staylight at `http://127.0.0.1:3003` by default and installs dependencies when needed. Override the port with `PORT=3000 ./start-local.sh`.

## Environment Variables

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
SERPAPI_API_KEY=
NEXT_PUBLIC_DEMO_MODE=sample
STAYLIGHT_RESEARCH_TTL_DAYS=30
STAYLIGHT_RESEARCH_CONCURRENCY=3
STAYLIGHT_DATA_DIR=
```

`OPENAI_API_KEY` and `SERPAPI_API_KEY` are read only by server-side API routes. They are not stored in browser storage and are not exposed to the client bundle.

Hotel profiles are written atomically to `.staylight-data/hotel-profiles.json` unless `STAYLIGHT_DATA_DIR` points to another local directory. The directory is excluded from Git.

## Modes

- Sample mode: works with 18 bundled real-hotel snapshots across Tokyo, Copenhagen, and Paris (6 per city). Hotel facts include official source links; prices are clearly labeled per-room, per-night demo estimates rather than live rates.
- Rule-based matching: dates determine stay length; budget, minimum rating, stay type, and known deal-breaker conflicts are hard filters. Requirements such as quiet sleep, transit, Wi-Fi, desk, bathtub, accessibility, room size, and nightlife avoidance change deterministic scores and evidence flags after research.
- Live mode: enter any city or country, select `Live`, and configure both server-side keys. Budget, accommodation type, rating, and explicit deal breakers are enforced before ranking. Search failures stop with a visible limitation instead of substituting Sample hotels; if AI summary generation fails, the same Live hotel candidates receive deterministic local explanations.
- Review research: after hard filtering, Staylight researches up to 18 diverse candidates before showing Results. Cached profiles are reused; `Analyze more hotels` processes the next 12 candidates. Research failures keep available structured hotel evidence instead of inventing review claims.

## API Routes

- `POST /api/profile`
- `POST /api/hotels/search`
- `POST /api/hotels/analyze`
- `POST /api/hotels/research-batch`
- `GET /api/status` (returns capability booleans, never key values)

## How GPT-5.6 And Codex Are Used

GPT-5.6 has three focused responsibilities. First, it conducts trip-specific follow-up questions and turns the conversation into structured requirements and keywords. Second, it builds reusable, sourced hotel review profiles from public-web evidence. Third, it turns deterministic match results and stored evidence into concise Hotel Details explanations. Budget filtering, accommodation filtering, platform-price selection, shortlist selection, and ranking scores remain deterministic and cannot be changed by the model.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Create a clean source archive without dependencies, build output, local keys, or macOS metadata:

```bash
npm run package:submission
```
