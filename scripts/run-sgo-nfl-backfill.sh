#!/bin/zsh
set -euo pipefail

ROOT="/Users/tonysoprano/.openclaw/workspace-marco/goosalytics"
LOG_DIR="$ROOT/logs/sgo-backfill"
STAMP="$(TZ=America/Toronto date +%Y-%m-%d_%H-%M-%S)"
OUT="$LOG_DIR/$STAMP.nfl.log"
LATEST="$LOG_DIR/latest-nfl.log"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"

mkdir -p "$LOG_DIR"
cd "$ROOT"

{
  echo "[$(TZ=America/Toronto date)] Starting SportsGameOdds NFL historical catch-up backfill"
  echo "[$(TZ=America/Toronto date)] Using node at $NODE_BIN"
  "$NODE_BIN" scripts/sgo-run-backfill.mjs 2024-02-01T00:00:00Z "$(date -u +%Y-%m-%dT%H:%M:%SZ)" NFL 7 250
  echo "[$(TZ=America/Toronto date)] Finished SportsGameOdds NFL historical catch-up backfill"
} >> "$OUT" 2>&1

cp "$OUT" "$LATEST"
