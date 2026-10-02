#!/usr/bin/env bash
# Guard against TypeScript compilation errors.
# Catches type mismatches, unused imports, and other static analysis issues.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! pnpm typecheck > /dev/null 2>&1; then
  echo "✘ TypeScript compilation failed."
  echo "Run 'pnpm typecheck' to see the full error output."
  exit 1
fi

echo "✓ TypeScript compilation successful."
