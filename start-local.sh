#!/bin/sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3004}"

cd "$PROJECT_DIR"

LOCAL_NODE_BIN="$PROJECT_DIR/.tools/node-v22.23.2-darwin-arm64/bin"
if [ -x "$LOCAL_NODE_BIN/node" ]; then
  PATH="$LOCAL_NODE_BIN:$PATH"
  export PATH
fi

export WATCHPACK_POLLING=true

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Staylight requires Node.js 20, 22, or 23 and npm."
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ] || [ "$NODE_MAJOR" -ge 24 ]; then
  echo "Unsupported Node.js version: $(node --version)"
  echo "Install Node.js 22 LTS, then run this script again."
  exit 1
fi

if [ ! -x "$PROJECT_DIR/node_modules/.bin/next" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Staylight with $(node --version) at http://127.0.0.1:$PORT"
exec npm run dev -- --hostname 127.0.0.1 --port "$PORT"
