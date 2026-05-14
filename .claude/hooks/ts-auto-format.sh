#!/bin/bash
# Auto-format files on edit (Prettier).
# Skips silently if Prettier is not available in the current toolchain.
FILE="$1"
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.yml|*.yaml)
    REPO=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
    cd "$REPO" || exit 0
    if [ -x node_modules/.bin/prettier ]; then
      ./node_modules/.bin/prettier --write "$FILE" 2>/dev/null
    fi
    ;;
esac
exit 0
