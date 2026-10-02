#!/usr/bin/env bash
# Install local git hooks that run the same guard scripts used in CI.
# Run this once after cloning: bash scripts/install-hooks.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Respect core.hooksPath, including the repository's documented .githooks setup.
HOOKS_DIR="$(git rev-parse --git-path hooks)"
mkdir -p "$HOOKS_DIR"

cat > "$HOOKS_DIR/pre-push" << 'HOOK'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
echo "Running guard scripts before push..."
bash "$ROOT/scripts/check-typecheck.sh"
bash "$ROOT/scripts/check-actions.sh"
echo "All guard checks passed."
HOOK

chmod +x "$HOOKS_DIR/pre-push"
echo "Installed pre-push hook at $HOOKS_DIR/pre-push"
