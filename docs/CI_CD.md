# Staylight CI/CD

Staylight uses GitHub Actions for continuous integration and Vercel for production deployment.

## Continuous Integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`. It installs the locked dependencies with `npm ci`, then runs linting, TypeScript checks, tests, and a Next.js production build in Sample mode.

The CI build does not need OpenAI or SerpApi credentials. Secrets are never exposed to pull-request CI jobs.

## Production Deployment

`.github/workflows/deploy-production.yml` runs after CI succeeds for a push to `main`. It can also be started manually from GitHub Actions. The workflow checks out the exact commit verified by CI, pulls the linked Vercel settings, builds it, and deploys the prebuilt artifact. Failed CI runs never trigger an automatic deployment.

## Initial Vercel Setup

1. Import this GitHub repository into Vercel as a Next.js project.
2. Add the application variables under Vercel Project Settings, Environment Variables:

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6
SERPAPI_API_KEY
NEXT_PUBLIC_DEMO_MODE=sample
STAYLIGHT_RESEARCH_TTL_DAYS=30
STAYLIGHT_RESEARCH_CONCURRENCY=3
STAYLIGHT_DATA_DIR=/tmp/staylight-data
```

3. Create a Vercel access token.
4. Add these repository secrets under GitHub Settings, Secrets and variables, Actions:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

`VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are written to `.vercel/project.json` after running `npx vercel link`. Application secrets belong in Vercel; GitHub Actions only needs the three deployment credentials above.

## Branch Protection

Protect `main` with a GitHub ruleset that requires a pull request and the `Lint, typecheck, test, and build` status check before merging.

## Persistence Limitation

The current research cache uses `.staylight-data/hotel-profiles.json`. Vercel Functions do not provide persistent local storage. `STAYLIGHT_DATA_DIR=/tmp/staylight-data` allows temporary runtime writes, but cached profiles can disappear between function instances or deployments.

For durable production storage, move `lib/hotel-profile-store.ts` to Postgres, Neon, or Supabase while preserving the `HotelResearchProfile` contract.

## Release Verification

After merging into `main`, verify that CI succeeds, Deploy Production follows it, `/api/status` reports the expected capabilities, and both a Sample search and a Live search complete successfully.

## Rollback

Promote the previous healthy deployment from the Vercel dashboard, then revert the faulty commit through a pull request so source control and production converge again.

