#!/usr/bin/env bash
# Guard against SQL action and CSP validation errors.
# Validates:
#   - All registered actions compile correctly against migrations
#   - CSP policy is correctly configured and in sync with bootstrap
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Validating SQL actions..."
if ! node --no-warnings qa/actions.mjs > /dev/null 2>&1; then
  echo "✘ SQL action validation failed."
  echo "Run 'node qa/actions.mjs' to see the full error output."
  exit 1
fi

echo "Validating CSP policy..."
if ! node --no-warnings qa/csp.mjs > /dev/null 2>&1; then
  echo "✘ CSP validation failed."
  echo "Run 'node qa/csp.mjs' to see the full error output."
  exit 1
fi

echo "✓ SQL actions and CSP validation successful."
