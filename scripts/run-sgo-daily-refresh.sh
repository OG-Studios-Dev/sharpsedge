#!/bin/zsh
set -euo pipefail

ROOT="/Users/tonysoprano/.openclaw/workspace-marco/goosalytics"
LOG_DIR="$ROOT/logs/sgo-daily"
STAMP="$(TZ=America/Toronto date +%Y-%m-%d_%H-%M-%S)"
OUT="$LOG_DIR/$STAMP.log"
LATEST="$LOG_DIR/latest.log"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
SPORTS="${SGO_DAILY_SPORTS:-NBA,NHL,MLB,NFL}"
WINDOW_DAYS="${SGO_DAILY_WINDOW_DAYS:-2}"
LIMIT="${SGO_DAILY_LIMIT:-250}"
GRADE_LOOKBACK_DAYS="${SGO_GRADE_LOOKBACK_DAYS:-3}"
END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_UTC="$(date -u -v-${WINDOW_DAYS}d +%Y-%m-%dT00:00:00Z)"

mkdir -p "$LOG_DIR"
cd "$ROOT"

{
  echo "[$(TZ=America/Toronto date)] Starting full-market daily warehouse refresh"
  echo "[$(TZ=America/Toronto date)] Using node at $NODE_BIN"
  echo "[$(TZ=America/Toronto date)] Sports: $SPORTS"
  echo "[$(TZ=America/Toronto date)] Capture window: $START_UTC -> $END_UTC"
  echo "[$(TZ=America/Toronto date)] Candidate limit per pull: $LIMIT"

  "$NODE_BIN" scripts/sgo-run-backfill.mjs "$START_UTC" "$END_UTC" "$SPORTS" 1 "$LIMIT"

  echo "[$(TZ=America/Toronto date)] Starting next-day grading pass"
  "$NODE_BIN" scripts/run-goose2-grade.mjs "$(date -u +%Y-%m-%d)" "" "$GRADE_LOOKBACK_DAYS"

  echo "[$(TZ=America/Toronto date)] Finished full-market daily warehouse refresh"
} >> "$OUT" 2>&1

cp "$OUT" "$LATEST"
