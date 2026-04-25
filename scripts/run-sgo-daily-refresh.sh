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
  echo "[$(TZ=America/Toronto date)] Daily archive rail: /api/odds/aggregated/snapshot?cron=true&sports=$SPORTS&reason=lm-daily-archive"
  echo "[$(TZ=America/Toronto date)] Grade lookback days: $GRADE_LOOKBACK_DAYS"
  echo "[$(TZ=America/Toronto date)] Legacy historical window (unused for daily warehouse): $START_UTC -> $END_UTC"
  echo "[$(TZ=America/Toronto date)] Legacy candidate limit (unused for daily warehouse): $LIMIT"

  "$NODE_BIN" scripts/run-daily-warehouse-refresh.mjs

  echo "[$(TZ=America/Toronto date)] Writing warehouse audit artifact"
  "$NODE_BIN" scripts/goose-warehouse-completeness-audit.mjs

  echo "[$(TZ=America/Toronto date)] Finished full-market daily warehouse refresh"
} >> "$OUT" 2>&1

cp "$OUT" "$LATEST"
