#!/usr/bin/env bash
# Bundle-size budget guard (Phase 3).
# Run AFTER `npx vite build`. Fails when the entry chunk or dist total
# regresses past the budget. Thresholds sit just above the post-fix numbers;
# tighten them when the bundle shrinks again.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIST="dist"
ENTRY_BUDGET_KB=${ENTRY_BUDGET_KB:-1500}   # post-fix entry chunk; baseline was 1505 KB
TOTAL_BUDGET_KB=${TOTAL_BUDGET_KB:-6800}   # whole dist/

if [ ! -d "$DIST/assets" ]; then
  echo "dist/assets missing — run 'npx vite build' first" >&2
  exit 2
fi

ENTRY=$(ls -S "$DIST"/assets/index-*.js 2>/dev/null | head -1 || true)
if [ -z "$ENTRY" ]; then
  echo "no entry chunk found in $DIST/assets" >&2
  exit 2
fi

ENTRY_KB=$(( $(stat -c %s "$ENTRY") / 1024 ))
TOTAL_KB=$(du -sk "$DIST" | awk '{print $1}')

echo "entry: $ENTRY  ${ENTRY_KB} KB (budget ${ENTRY_BUDGET_KB} KB)"
echo "dist total: ${TOTAL_KB} KB (budget ${TOTAL_BUDGET_KB} KB)"

STATUS=0
if [ "$ENTRY_KB" -gt "$ENTRY_BUDGET_KB" ]; then
  echo "FAIL: entry chunk over budget" >&2
  STATUS=1
fi
if [ "$TOTAL_KB" -gt "$TOTAL_BUDGET_KB" ]; then
  echo "FAIL: dist total over budget" >&2
  STATUS=1
fi
exit $STATUS
