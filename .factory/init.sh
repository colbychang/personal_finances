#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# Install dependencies if package.json exists and node_modules is stale
if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
    npm install
  fi
fi

# Run database migrations if drizzle is configured
if [ -f "drizzle.config.ts" ]; then
  npx drizzle-kit migrate 2>/dev/null || true
fi
