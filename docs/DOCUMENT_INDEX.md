# Staylight Documentation Index

This package contains the current Staylight project documentation.

## Included Files

- `README.md`: Product overview, local setup, operating modes, API routes, environment variables, and verification commands.
- `docs/PROJECT_LOGIC.md`: End-to-end architecture, data flow, filtering rules, batched review research, cache behavior, candidate states, failure handling, and module map.
- `outputs/Staylight_OpenAI_Build_Week_Sprint_PRD.md`: Original sprint PRD, technical specification, and build plan created for the initial OpenAI Build Week version.
- `.env.example`: Safe server-side environment variable template without secret values.

## Recommended Reading Order

1. Start with `README.md` to run the product locally.
2. Read `docs/PROJECT_LOGIC.md` before changing search, research, ranking, or storage behavior.
3. Use the sprint PRD for the original product rationale and scope history.

## Security Note

This package does not contain `.env.local`, API keys, dependencies, build output, or the local hotel review-profile database.
