#!/bin/bash
# Local quality gate invoked by pre-commit.
# Runs tsc + eslint scoped to staged TS/TSX files when tooling is available.
# Skips gracefully when node_modules is missing so first-time contributors
# don't hit a blocker before running `npm install`.

set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

if [ ! -d node_modules ]; then
  echo "quality-gate: node_modules/ missing -- run 'npm install', then retry"
  exit 0
fi

# Type check (project-wide; tsc doesn't take per-file args without --files)
if [ -x node_modules/.bin/tsc ]; then
  echo "quality-gate: tsc --noEmit"
  ./node_modules/.bin/tsc --noEmit
fi

# ESLint scoped to staged TS/TSX
STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.tsx?$' || true)
if [ -n "$STAGED" ] && [ -x node_modules/.bin/eslint ]; then
  echo "quality-gate: eslint (staged)"
  echo "$STAGED" | xargs ./node_modules/.bin/eslint --max-warnings 0
fi

echo "quality-gate: PASS"
exit 0
