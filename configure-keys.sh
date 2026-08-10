#!/bin/sh

set -eu

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"

restore_terminal() {
  stty echo 2>/dev/null || true
}

read_secret() {
  printf "%s" "$1"
  stty -echo
  IFS= read -r SECRET_VALUE
  stty echo
  printf "\n"
}

trap restore_terminal EXIT INT TERM

read_secret "OpenAI API Key: "
OPENAI_API_KEY="$SECRET_VALUE"

read_secret "SerpAPI Key (press Enter to leave empty): "
SERPAPI_API_KEY="$SECRET_VALUE"

if [ -z "$OPENAI_API_KEY" ]; then
  echo "OpenAI API Key cannot be empty. Nothing was changed."
  exit 1
fi

umask 077
{
  printf "OPENAI_API_KEY=%s\n" "$OPENAI_API_KEY"
  printf "OPENAI_MODEL=gpt-5.6\n"
  printf "SERPAPI_API_KEY=%s\n" "$SERPAPI_API_KEY"
} > "$ENV_FILE"

echo "Saved securely to $ENV_FILE"
echo "Restart Staylight with: ./start-local.sh"
