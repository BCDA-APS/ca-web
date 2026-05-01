#!/usr/bin/env bash
file="$1"
for protected in package-lock.json poetry.lock uv.lock yarn.lock; do
  if [[ "$file" == *"$protected" ]]; then
    echo "Refusing to edit $protected -- run the package manager instead."
    exit 1
  fi
done
exit 0
