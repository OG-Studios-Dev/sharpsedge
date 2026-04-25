#!/bin/zsh
set -euo pipefail

ROOT="/Users/tonysoprano/.openclaw/workspace-marco/goosalytics"
LOG_DIR="$ROOT/logs/goose-audits"
STAMP="$(TZ=America/Toronto date +%Y-%m-%d_%H-%M-%S)"
OUT="$LOG_DIR/$STAMP.json"
LATEST="$LOG_DIR/latest.json"
SUMMARY="$LOG_DIR/$STAMP-summary.txt"
LATEST_SUMMARY="$LOG_DIR/latest-summary.txt"

NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"

mkdir -p "$LOG_DIR"
cd "$ROOT"

echo "[$(TZ=America/Toronto date)] Using node at $NODE_BIN" >&2
"$NODE_BIN" scripts/goose-production-coverage-audit.mjs > "$OUT"
cp "$OUT" "$LATEST"
"$NODE_BIN" scripts/goose-production-coverage-summary.mjs "$OUT" > "$SUMMARY"
cp "$SUMMARY" "$LATEST_SUMMARY"

echo "Wrote Goose production coverage audit to $OUT"
echo "Wrote Goose production coverage summary to $SUMMARY"
