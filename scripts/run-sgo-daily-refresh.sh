#!/bin/zsh
set -euo pipefail

ROOT="/Users/tonysoprano/.openclaw/workspace-marco/goosalytics"
LOG_DIR="$ROOT/logs/sgo-daily"
STAMP="$(TZ=America/Toronto date +%Y-%m-%d_%H-%M-%S)"
OUT="$LOG_DIR/$STAMP.log"
LATEST="$LOG_DIR/latest.log"
END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_UTC="$(date -u -v-2d +%Y-%m-%dT00:00:00Z)"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"

mkdir -p "$LOG_DIR"
cd "$ROOT"

{
  echo "[$(TZ=America/Toronto date)] Starting SportsGameOdds daily refresh"
  echo "[$(TZ=America/Toronto date)] Using node at $NODE_BIN"
  "$NODE_BIN" scripts/sgo-run-backfill.mjs "$START_UTC" "$END_UTC" NBA,NHL,MLB 1 250
  echo "[$(TZ=America/Toronto date)] Finished SportsGameOdds daily refresh"
} >> "$OUT" 2>&1

cp "$OUT" "$LATEST"
