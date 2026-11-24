#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

NAGA="${NAGA:-$(command -v naga || true)}"
if [ -z "$NAGA" ] && [ -x "$HOME/.cargo/bin/naga" ]; then
  NAGA="$HOME/.cargo/bin/naga"
fi
if [ -z "$NAGA" ]; then
  echo "naga not found. Install with: cargo install naga-cli --locked" >&2
  exit 1
fi

for file in src/core/shaders/*.wgsl; do
  printf '%-24s ' "$(basename "$file")"
  "$NAGA" "$file"
done
