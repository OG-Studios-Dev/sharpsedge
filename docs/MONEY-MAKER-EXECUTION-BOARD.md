# Money Maker (Goose 2.0) — Execution Board

**Owner:** Magoo  
**Goal:** Make Goose 2.0 an honest, trainable, daily ML picks engine for live leagues  
**Proof required:** schema/route diffs, successful snapshot + grading output, reproducible training export, shadow audit evidence  
**Last updated:** 2026-04-10

## Terminal status
**Partial** — database spine exists and player-prop snapshot support landed, but feature depth and settlement integrity are still incomplete.

---

## Blunt current state

### Already real
- Canonical market warehouse exists:
  - `market_snapshots`
  - `market_snapshot_events`
  - `market_snapshot_prices`
- Goose 2.0 warehouse exists:
  - `goose_market_candidates`
  - `goose_market_results`
  - `goose_feature_rows`
  - `goose_decision_log`
- Production/sandbox rails exist:
  - `pick_slates`
  - `pick_history`
  - `sandbox_pick_slates`
  - `sandbox_pick_history`
  - `goose_model_picks`
- Snapshot pipeline now stores team markets, F5 markets, and player props in canonical storage.
- Snapshot pipeline also bootstraps Goose 2.0 shadow rows on capture.

### Not real enough yet
- `goose_feature_rows` are still too thin. Current payloads are mostly market metadata, not sport-aware model features.
- Settlement integrity is uneven by market type, especially derivative markets like MLB first five and any newly stored prop families.
- Candidate capture is ahead of label truth. That is dangerous if training starts before unsupported markets are explicitly excluded.
- Shadow mode exists structurally, but it does not yet prove the Money Maker is sharp.

---

## Priority board

## P0 — Must fix now

### P0.1 Settlement integrity by market
**Goal:** Every active Goose 2.0 market must resolve into an honest result row, or be explicitly marked ungradeable / manual review.

**Why this is first:** bad labels poison the entire model.

**Markets requiring explicit verification/fix first**
- MLB `first_five_moneyline`
- MLB `first_five_total`
- NBA quarter derivative markets if retained in Goose 2.0 training
- PGA `golf_matchup` if retained
- Every active player-prop family now being stored in `market_snapshot_prices`

**Files/routes to hit**
- `src/lib/pick-resolver.ts`
- `src/app/api/admin/goose-model/auto-grade/route.ts`
- New Goose 2.0 result-labeling helper(s) under `src/lib/goose2/` if needed

**Definition of done**
- `goose_market_results` can be filled reproducibly for supported markets
- unsupported markets never linger as fake `pending`
- final events with insufficient data become `ungradeable`, `void`, or `manual_review`
- one rerun on the same final event produces the same label

**Proof required**
- route output or SQL row dump for `goose_market_results`
- example labels for NHL core, NBA core, MLB F5, PGA placements
- explicit examples of unsupported markets being excluded honestly

---

### P0.2 Upgrade Goose 2.0 feature rows from receipt data to real model features
**Goal:** `goose_feature_rows` must store actual predictive context, not just line/odds/book metadata.

**Why this is first-tier:** without real feature depth, Goose 2.0 is not a Money Maker, it is a logging system.

**Main file**
- `src/lib/goose2/feature-mappers.ts`

**Must start storing**
- recent form / rolling performance
- matchup context
- home/away / venue state
- opponent defense / suppression / allowance context
- lineup/injury confidence where available
- source freshness / stale-source flags
- market shape context: book count, price dispersion, best-vs-median, move flags
- sport-specific enrichments already available elsewhere in the repo

**Source rails to connect**
- NHL: API/gamecenter rails, matchup/context helpers
- NBA: ESPN boxscore/context/features rails
- MLB: enrichment/starter/bullpen/umpire rails
- PGA: placement/model context

**Definition of done**
- feature payload differs meaningfully by sport and market
- source chain explains where major features came from
- missing data is flagged, not silently defaulted into fake certainty

**Proof required**
- sample `goose_feature_rows` payloads for at least NHL, NBA, MLB
- source-chain examples for each

---

### P0.3 Separate “stored” from “trainable”
**Goal:** Not every captured market should enter training immediately.

**Why this matters:** storage coverage and training-quality coverage are not the same thing.

**Files**
- `src/lib/player-prop-snapshot.ts`
- `src/lib/market-snapshot-store.ts`
- `src/lib/goose2/shadow-pipeline.ts`
- `src/lib/goose2/snapshot-backfill.ts`
- potentially `src/lib/goose2/training-audit.ts`

**Definition of done**
- trainable market list is explicit
- unsupported or weakly-labeled markets are stored but excluded from training exports
- training audit clearly reports excluded counts and reasons

**Proof required**
- training-audit output showing included vs excluded rows
- explicit market inclusion table by sport

---

## P1 — Next after labels and features are honest

### P1.1 Clean training export
**Goal:** Build reproducible sport/market/date-window training exports from Goose 2.0 tables.

**Files/routes**
- `src/lib/goose2/training-audit.ts`
- `src/app/api/admin/goose2/training-audit/route.ts`
- possibly new export helpers under `src/lib/goose2/`

**Definition of done**
- export returns candidate + feature + result + integrity flag
- export can filter by sport/market/date
- replayed export on same window is stable

**Proof required**
- sample export payload
- counts by sport/market

---

### P1.2 Build sport-by-sport Money Maker feature depth
**Recommended order**
1. NHL team ML + SOG props
2. MLB first five markets
3. NBA points props
4. PGA placement markets

**Reason**
- best mix of current rails, market value, and settlement practicality

**Files likely touched**
- `src/lib/goose2/feature-mappers.ts`
- NHL/NBA/MLB/PGA context helpers already present in sport libs

**Definition of done**
- each priority market has a clearly richer feature payload than phase1-initial
- no market enters “serious model” consideration with placeholder features

---

### P1.3 Replace shadow-only policy with real accept/reject logic
**Goal:** Decision layer should rank candidates for actual bet/no-bet reasoning, even while still shadowed.

**Main file**
- `src/lib/goose2/policy.ts`

**Needs**
- edge thresholds
- quality gates
- exposure caps
- anti-correlation rules
- reject reasons tied to actual conditions

**Definition of done**
- decision logs explain why a candidate was accepted or rejected
- policy is deterministic and versioned

---

## P2 — Only after the engine is honest

### P2.1 Shadow-vs-production scoreboard
**Goal:** Compare Goose 2.0 against current picks and track whether it actually earns trust.

**Files/routes**
- `src/lib/goose2/training-audit.ts`
- `/admin/goose-model`
- optional dedicated Goose 2 dashboard later

**Metrics**
- hit rate by sport/market
- CLV where possible
- edge bucket behavior
- rejected edge inventory
- shadow vs production comparison

---

### P2.2 Promotion gates
Existing routes already exist:
- `/api/admin/goose-model/promotion-candidates`
- `/api/admin/goose-model/promote`

**Rule:** do not treat these as the next task. Promotion is downstream of honest labels, real features, and shadow evidence.

---

## Recommended exact build order

1. Finish result labeling for every active Goose 2 market family
2. Mark weak/unsupported markets out of training
3. Upgrade `feature-mappers.ts` into a real sport-aware feature store
4. Build stable training export / training audit
5. Run shadow mode cleanly over a real sample window
6. Compare Goose 2.0 against production before any promotion talk

---

## Most important files right now
- `src/lib/pick-resolver.ts`
- `src/app/api/admin/goose-model/auto-grade/route.ts`
- `src/lib/goose2/feature-mappers.ts`
- `src/lib/player-prop-snapshot.ts`
- `src/lib/market-snapshot-store.ts`
- `src/lib/goose2/shadow-pipeline.ts`
- `src/lib/goose2/training-audit.ts`

---

## Market readiness snapshot

### NHL
- Team ML: ready
- Team spread: ready
- Team total: partial
- Player SOG: ready
- Player goals: ready
- Player points: ready
- Player assists: ready
- Feature richness: partial
- Settlement integrity: good

### NBA
- Team ML: ready
- Team spread: ready
- Team total: ready
- Player points: ready
- Player rebounds: ready
- Player assists: ready
- Player threes: ready
- Quarter derivatives: partial / caution
- Feature richness: best current rail
- Settlement integrity: good, but derivative caution remains

### MLB
- Team ML: ready
- Run line: ready
- Totals: partial to ready
- First five ML: ingest ready, grading still priority
- First five total: ingest ready, grading still priority
- Player hits: ready
- Player total bases: ready
- Pitcher strikeouts: ready
- Other prop families: partial
- Feature richness: partial
- Settlement integrity: mixed

### PGA
- Placement markets: usable
- Matchups: partial / verify before trusting
- Feature richness: partial
- Settlement integrity: decent on placement markets

### NFL
- Taxonomy/storage support: present
- Real live Money Maker scope: not now

---

## Non-goals right now
- NFL rollout
- more consumer-facing AI pick copy
- promotion/marketing claims
- expanding market count before label truth is fixed

---

## Bottom line
The Money Maker is **structurally real** but **not yet sharp enough to trust**.  
What blocks trust is not table design anymore. It is:
- honest result labeling
- real feature depth
- clean training inclusion rules
- shadow evidence

No proof, no rollout.
