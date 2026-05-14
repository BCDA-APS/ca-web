#!/bin/bash
# Warn when core source changes lack corresponding docs updates.
#
# Modes:
#   (no args)          -- pre-commit: inspect staged files, exit 1 to block commit
#   claude             -- Claude Code: inspect all uncommitted changes vs HEAD
#   claude-file <path> -- Claude Edit/Write: only warn if <path> is core source
#                         and no docs were touched in the working tree
#
# Exit codes:
#   0 = pass (no core changes, or docs were also touched, or file is irrelevant)
#   1 = warn (core changes detected without doc updates)

set -euo pipefail

MODE="${1:-git}"
FILE="${2:-}"
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

# Files that move the architectural surface
CORE_PATTERNS='src/lib/.*\.tsx?$|src/widgets/.*\.tsx?$|src/deployments/.*\.tsx?$|src/App\.tsx$|src/main\.tsx$'

# Files that count as a doc update
DOC_PATTERNS='docs/|CHANGELOG\.md|CLAUDE\.md'

# claude-file: quick gate -- only proceed if the edited file is core source
if [ "$MODE" = "claude-file" ]; then
  if [ -z "$FILE" ]; then
    exit 0
  fi
  REL_FILE="${FILE#$(git rev-parse --show-toplevel)/}"
  if ! echo "$REL_FILE" | grep -qE "$CORE_PATTERNS"; then
    exit 0
  fi
  MODE="claude"
fi

# Collect changed files (tracked + untracked-but-not-ignored in claude mode)
if [ "$MODE" = "claude" ]; then
  CHANGED=$( {
    git diff --name-only HEAD 2>/dev/null || git diff --name-only;
    git ls-files --others --exclude-standard 2>/dev/null;
  } | sort -u )
else
  CHANGED=$(git diff --cached --name-only)
fi

if [ -z "$CHANGED" ]; then
  exit 0
fi

CORE_CHANGED=$(echo "$CHANGED" | grep -E "$CORE_PATTERNS" || true)
if [ -z "$CORE_CHANGED" ]; then
  exit 0
fi

DOC_CHANGED=$(echo "$CHANGED" | grep -E "$DOC_PATTERNS" || true)
if [ -z "$DOC_CHANGED" ]; then
  echo ""
  echo "WARNING: core source changed without a docs update."
  echo ""
  echo "  Changed:"
  echo "$CORE_CHANGED" | sed 's/^/    /'
  echo ""
  echo "  Expected: update CHANGELOG.md, docs/architecture.md,"
  echo "  or a relevant doc under docs/."
  echo ""
  exit 1
fi

exit 0
