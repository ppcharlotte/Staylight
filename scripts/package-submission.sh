#!/bin/sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="$PROJECT_DIR/release/staylight-submission.zip"

cd "$PROJECT_DIR"
mkdir -p release

zip -rqFS "$ARCHIVE" \
  app \
  docs \
  lib \
  tests \
  scripts \
  outputs \
  public \
  .env.example \
  .gitignore \
  .nvmrc \
  biome.json \
  next-env.d.ts \
  next.config.mjs \
  package.json \
  package-lock.json \
  README.md \
  configure-keys.sh \
  start-local.sh \
  tsconfig.json \
  tsconfig.check.json \
  tsconfig.tests.json \
  -x "*/.DS_Store" "*.log" "*.tsbuildinfo" "*.zip" "public/*-source.png" "public/staylight-mark.png" "public/staylight-mark-v2.png" "public/staylight-mark-clean.png" "public/staylight-mark-final.png"

echo "Created $ARCHIVE"
