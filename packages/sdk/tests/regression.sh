#!/bin/bash
# Regression test: renders all examples and diffs against golden SVGs
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI="$ROOT/packages/sdk/dist/cli.js"
GOLDEN="$SCRIPT_DIR/golden"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

PASS=0
FAIL=0

for f in "$ROOT"/examples/*.js; do
  name=$(basename "$f" .js)
  for eng in clean rough; do
    out="$TMP/${name}-${eng}.svg"
    golden="$GOLDEN/${name}-${eng}.svg"
    node "$CLI" "$f" -o "$out" -e "$eng" 2>/dev/null
    if [ ! -f "$golden" ]; then
      echo "SKIP $name ($eng) — no golden file"
      continue
    fi
    if diff -q "$golden" "$out" >/dev/null 2>&1; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
      echo "FAIL $name ($eng)"
    fi
  done
done

echo ""
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
