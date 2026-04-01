# DraftKings Golf Finish-Market Capture Workflow

## Overview

This doc covers the end-to-end workflow for capturing real DraftKings golf finish-market odds (Top 5 / Top 10 / Top 20) and ingesting them into the app so they are used as the **Priority 1 source** for picks and analysis.

---

## Source Priority Chain

`GET /api/golf/finish-market-odds?tournament={slug}` resolves in this order:

| Priority | Source | How to populate |
|---|---|---|
| **1** | `data/manual-dk-seeds/{slug}.json` (local repo file) | Run `capture-dk-odds.mjs` or `ingest-dk-seed.mjs` |
| 2 | Supabase `pga_finish_odds` (draftkings-manual or oddschecker-manual) | POST `/api/golf/finish-market-odds` or use `--post` flag |
| 3 | Supabase `golf_odds_snapshots` (Bovada scraped) | Bovada scraper |
| 4 | Local Bovada snapshot in `data/golf-odds-snapshots/` | Existing snapshot files |
| 5 | The Odds API provisional derivation | Auto (majors only) |

**DK values in the seed file always override Bovada, provisional, and scraper fallbacks.**

---

## Scripts

### `scripts/capture-dk-odds.mjs` — Full Browser Capture

Uses Playwright (real Chromium) to navigate DraftKings, find the tournament, and extract finish-market odds.

```bash
# Standard capture — opens browser, saves to data/manual-dk-seeds/
node scripts/capture-dk-odds.mjs --tournament valero-texas-open

# With explicit display name (shown in UI and source labels)
node scripts/capture-dk-odds.mjs \
  --tournament the-masters-2026 \
  --tournament-name "The Masters 2026"

# Dry run — print to console, don't write
node scripts/capture-dk-odds.mjs --tournament valero-texas-open --dry-run

# Also POST to running dev server
node scripts/capture-dk-odds.mjs --tournament valero-texas-open --post

# Headless mode (no browser window — for CI environments)
node scripts/capture-dk-odds.mjs --tournament valero-texas-open --headless

# Full options
node scripts/capture-dk-odds.mjs \
  --tournament rbc-heritage \
  --tournament-name "RBC Heritage 2026" \
  --post \
  --url http://localhost:3000
```

**Output:** `data/manual-dk-seeds/{tournament-slug}.json`

**Notes:**
- Headed mode (default) helps avoid DK bot detection; you can watch it work
- If DK changes its page layout, check `out/dk-capture-debug-*.png` debug screenshots
- If the script can't auto-find the tournament, it pauses 15s for manual navigation

---

### `scripts/ingest-dk-seed.mjs` — Manual / File Ingest

Converts raw odds data (from screenshots, manual typing, or a raw JSON) into the proper `FinishOddsSnapshot` format.

```bash
# Inline odds (copy from DK screenshot)
node scripts/ingest-dk-seed.mjs \
  --tournament valero-texas-open \
  --top5 "Ludvig Aberg:260,Jordan Spieth:290,Tommy Fleetwood:290" \
  --top10 "Ludvig Aberg:-120,Jordan Spieth:110,Tommy Fleetwood:110" \
  --top20 "Ludvig Aberg:-350,Jordan Spieth:-250,Tommy Fleetwood:-250"

# Re-ingest / reformat an existing file
node scripts/ingest-dk-seed.mjs \
  --tournament the-masters-2026 \
  --from-file data/manual-dk-seeds/the-masters-2026.json

# Dry run
node scripts/ingest-dk-seed.mjs --tournament valero-texas-open --dry-run \
  --top5 "Scottie Scheffler:260,Rory McIlroy:320"
```

**Inline format:** `"Player Name:AmericanOdds,..."` — use the raw American line (e.g. `260` for +260, `-120` for -120)

**Raw JSON format (`--from-file`):**
```json
{
  "top5":  [{ "player": "Scottie Scheffler", "odds": 260 }, ...],
  "top10": [{ "player": "Scottie Scheffler", "odds": -130 }, ...],
  "top20": [{ "player": "Scottie Scheffler", "odds": -400 }, ...]
}
```

---

## Tournament Slugs

Use the same slug for `--tournament` as the URL query param in the app:

| Tournament | Slug |
|---|---|
| Valero Texas Open | `valero-texas-open` |
| The Masters | `the-masters-2026` or `masters` |
| RBC Heritage | `rbc-heritage` |
| PGA Championship | `pga-championship` |
| US Open | `us-open` |
| The Open Championship | `the-open` |

The slug must match the key used in `GET /api/golf/finish-market-odds?tournament={slug}`.

---

## Repeated Weekly Use

For each new PGA Tour event:

1. **Tuesday–Wednesday** before the tournament starts:
   ```bash
   node scripts/capture-dk-odds.mjs --tournament {slug} --tournament-name "{Full Name}"
   ```
2. Verify the output file at `data/manual-dk-seeds/{slug}.json`
3. Optionally `git commit` the seed file to persist it in the repo
4. App automatically picks it up as Priority 1 — no deploy needed (dev server reads it live)

For Vercel production, commit the seed file so Vercel bundles it with the deployment.

---

## Provenance in the UI

Every pick and analysis line that uses DK-sourced data shows:
- `source: "draftkings-manual"`
- `source_label: "DraftKings (browser capture, 2026-04-01)"`  
- `book: "DraftKings"`

The app never presents DK-captured lines as provisional or derived.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser opens but tournament not found | Run with headed mode (default), navigate manually during the 15s pause |
| `0 players extracted` for a market | Check `out/dk-capture-debug-{market}.png`; DK may have changed DOM structure |
| Bot detection / CAPTCHA | Run headed (default), solve manually; or try at off-peak hours |
| Wrong tournament matched | Use `--tournament-name` with the exact name as shown on DK |
| Valero not on DK yet | Check DK 1–2 weeks before the event; odds go live mid-week |
