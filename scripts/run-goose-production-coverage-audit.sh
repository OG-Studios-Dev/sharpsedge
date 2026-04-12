#!/bin/zsh
set -euo pipefail

ROOT="/Users/tonysoprano/.openclaw/workspace-marco/goosalytics"
LOG_DIR="$ROOT/logs/goose-audits"
STAMP="$(TZ=America/Toronto date +%Y-%m-%d_%H-%M-%S)"
OUT="$LOG_DIR/$STAMP.json"
LATEST="$LOG_DIR/latest.json"

mkdir -p "$LOG_DIR"
cd "$ROOT"

node scripts/goose-production-coverage-audit.mjs > "$OUT"
cp "$OUT" "$LATEST"

echo "Wrote Goose production coverage audit to $OUT"
