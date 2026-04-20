# Odds API Source Contract for Goosalytics

## Purpose

This document defines the canonical ingestion contract for live and historical data from The Odds API v4 for Goosalytics.

The goal is simple:
- stop treating the feed like loosely structured JSON
- start treating it like a documented source system
- make warehouse identity, market taxonomy, settlement, and quota strategy explicit

This spec is the backbone for:
- live odds capture
- historical backfill
- event identity
- participant identity
- market taxonomy
- settlement/grading support
- quota-aware endpoint selection

## Core principles

1. Source keys beat display strings.
   - Prefer official `sport_key`, `event.id`, market `key`, bookmaker `key`, participant ids when available.
   - Human-readable labels like `marketName`, `full_name`, `title`, or `description` are secondary.

2. Sport-aware mapping is mandatory.
   - Never classify markets globally with loose substring rules.
   - Terms like `goals`, `field goals`, `shots`, `totals`, and `points` are ambiguous across sports.

3. Event identity is first-class.
   - Use official Odds API event IDs whenever available.
   - Derived matchup/time IDs are fallback only.

4. Settlement is its own truth layer.
   - Odds intake and score intake are separate concerns.
   - The existence of odds does not imply gradeability.

5. Historical and live ingestion are related but not identical.
   - Historical endpoints are snapshot-based and quota-expensive.
   - Live endpoints are operational capture rails.

6. Unknown beats wrong.
   - If a market cannot be safely mapped, classify as `unknown` / `source_limited` / `unmapped`, not guessed.

## Endpoint roles

### 1. GET /v4/sports
Purpose:
- canonical sport discovery
- source-of-truth sport keys

Use in Goosalytics:
- maintain sport registry
- validate supported sport keys
- never hardcode ad hoc source sport names when official keys exist

Important notes:
- does not count against quota
- `all=true` can be used for full registry, but active sports should drive production selection

Goosalytics mapping:
- `basketball_nba` -> NBA
- `icehockey_nhl` -> NHL
- `baseball_mlb` -> MLB
- `americanfootball_nfl` -> NFL

### 2. GET /v4/sports/{sport}/events
Purpose:
- current event identity list
- event IDs, teams, commence times

Use in Goosalytics:
- live event registry
- event existence checks before event-level odds pulls
- canonical event linking between odds and scores

Important notes:
- does not count against quota
- preferred over constructing IDs from matchup text

Warehouse implications:
- store official source event ID
- store `source_event_id_kind = odds_api_event_id`
- if fallback is ever required, mark it explicitly

### 3. GET /v4/sports/{sport}/odds
Purpose:
- broad live/upcoming odds snapshot for featured markets
- best bulk intake rail for high-level markets

Best for:
- moneyline / h2h
- spreads
- totals
- broad live market coverage
- cheap operational refreshes

Important parameters:
- `regions`
- `markets`
- `bookmakers`
- `eventIds`
- `commenceTimeFrom`
- `commenceTimeTo`
- `dateFormat`
- `oddsFormat`
- `includeLinks`
- `includeSids`
- `includeBetLimits`
- `includeRotationNumbers`

Quota:
- cost = number of markets x number of regions
- empty responses do not count

Goosalytics guidance:
- this should remain the default live broad-capture rail
- use for current featured-market snapshots across NBA / NHL / MLB / NFL
- do not expect full prop completeness here

### 4. GET /v4/sports/{sport}/events/{eventId}/odds
Purpose:
- event-level live odds with access to any supported market
- richer per-event market detail, especially props

Best for:
- player props
- alternate lines
- event-level deep inspection
- market completeness checks

Important notes:
- `last_update` is market-level, not bookmaker-level
- relevant prop outcomes may include `description` field for participant names
- all available market keys are accepted in `markets`
- empty responses do not count toward quota
- quota cost uses unique markets returned x regions

Goosalytics guidance:
- use as the deep live enrichment rail
- do not use as the first pass for every event blindly or quota will get torched
- trigger per-event detail pulls only when:
  - event is selected for deeper prop capture
  - broad snapshot indicates target event relevance
  - auditing market completeness

### 5. GET /v4/sports/{sport}/events/{eventId}/markets
Purpose:
- event-level market catalog
- which market keys are currently available per bookmaker

Best for:
- preflight discovery before event odds pulls
- prop family visibility
- deciding whether a deep pull is worth the quota

Important notes:
- not a comprehensive all-time list, only recently seen market keys
- more keys appear as event time approaches
- fixed cost: 1 credit

Goosalytics guidance:
- use to decide whether a given event has the prop families we care about
- treat as a market availability hint, not canonical proof of universal support

### 6. GET /v4/sports/{sport}/participants
Purpose:
- whitelist of source participants for a sport
- team/player identity support depending on sport

Important notes:
- does not return players on a team for team sports
- returned list may include inactive participants
- useful as a whitelist, not a full roster feed

Goosalytics guidance:
- use for participant canonicalization support where applicable
- especially useful for team identity normalization
- not sufficient alone for player-prop roster resolution in NBA/NHL/MLB/NFL

### 7. GET /v4/sports/{sport}/scores
Purpose:
- live and recently completed event status + score outcomes
- settlement support for covered sports

Important notes:
- daysFrom supports 1 to 3 days back
- live scores update roughly every 30 seconds
- game `id` matches odds response event `id`
- only some sports are covered, expanding gradually
- cost = 1 for live/upcoming only, 2 if `daysFrom` is used

Goosalytics guidance:
- use as the current-event settlement/state rail where coverage exists
- do not assume it is sufficient for all prop grading
- final scores help team-market settlement, not all player props

### 8. GET /v4/historical/sports/{sport}/odds
Purpose:
- broad historical featured-market snapshot for a sport at a timestamp

Best for:
- wide backfill sweeps
- historical coverage audits
- opener/closer snapshot framework
- bulk featured-market warehouse ingestion

Important notes:
- historical snapshots available from 2020-06-06
- intervals are 10 minutes before 2022-09-18, then 5 minutes after
- returns closest snapshot equal to or earlier than provided `date`
- includes `timestamp`, `previous_timestamp`, `next_timestamp`
- empty responses do not count
- cost = 10 x markets x regions

Goosalytics guidance:
- this is the bulk historical spine for featured markets
- use it for broad sweeps before per-event deep enrichment
- because quota is expensive, prioritize:
  - one region at first
  - only the markets that matter
  - sparse cadence for early validation before dense backfill

### 9. GET /v4/historical/sports/{sport}/events
Purpose:
- historical event identity list at a timestamp

Best for:
- finding historical event IDs
- anchoring backfill to real source events
- reducing fuzzy historical matching

Important notes:
- cost = 1
- returns snapshot wrapper with `timestamp`, `previous_timestamp`, `next_timestamp`
- empty result does not count

Goosalytics guidance:
- this should be the historical identity backbone
- use it before historical event odds when event-level enrichment is needed

### 10. GET /v4/historical/sports/{sport}/events/{eventId}/odds
Purpose:
- historical event-level odds at a timestamp
- richer market detail for a specific past event

Best for:
- historical player props
- alternate lines
- event-level completeness checks
- detailed opener/closer reconstruction

Important notes:
- additional markets (props, alternate lines, period markets) available after `2023-05-03T05:30:00Z`
- snapshots available at 5 minute intervals
- empty responses do not count
- cost = 10 x unique markets returned x regions

Goosalytics guidance:
- this is the deep historical enrichment rail
- do not use as the first pass for every event unless quota supports it
- use selectively for:
  - high-value props
  - quality verification
  - event-level completeness audits
  - reconstructing detailed market history for model training

## Canonical pipeline design

## Live ingestion design

### Live identity flow
1. Refresh supported sports from `/sports` on a slow cadence.
2. Pull current events from `/sports/{sport}/events`.
3. Upsert source event IDs into canonical event registry.
4. Use `/odds` for broad market snapshot capture.
5. Use `/events/{eventId}/markets` or `/events/{eventId}/odds` for targeted enrichment.
6. Use `/scores` for near-term event status and settlement support.

### Live endpoint priority
- identity: `/events`
- broad featured markets: `/odds`
- deep props/alt lines: `/event-odds`
- market discovery: `/event-markets`
- settlement/status: `/scores`

### Live capture cadence recommendation
NBA / NHL / MLB / NFL:
- `/events`: every 10 to 20 minutes
- `/odds` broad featured snapshot: every 15 to 60 minutes depending on slate density
- `/event-markets` / `/event-odds`: targeted, not blanket
- `/scores`: every 1 to 5 minutes near live/final windows if operationally needed

## Historical backfill design

### Historical identity flow
1. Pull `/historical/events` for sport + timestamp windows.
2. Store source event IDs and source event metadata.
3. Run `/historical/odds` for broad featured-market sweeps.
4. Run `/historical/event-odds` only where deeper detail is justified.
5. Use settlement rails separately for grading and completeness checks.

### Historical endpoint priority
- broad sweep: `/historical/odds`
- event identity: `/historical/events`
- deep enrichment: `/historical/event-odds`

### Historical backfill strategy by league

#### NBA
- use `/historical/events` + `/historical/odds` as the main backfill spine
- selectively enrich with `/historical/event-odds` for player props and quarter markets
- strongest candidate for deep prop backfill

#### NHL
- use `/historical/events` + `/historical/odds` for broad team-market and basic prop coverage
- selectively use `/historical/event-odds` for player shots/goals when quota supports

#### MLB
- use `/historical/events` + `/historical/odds` first
- enrich with `/historical/event-odds` only for clearly valuable prop families
- coverage quality should be proven on the exact market families before dense expansion

#### NFL
- do not assume viability from current tests
- re-validate with official historical endpoints now that paid access is active
- only promote to phase 1 if real historical event + odds pulls show stable coverage and useful market depth

## Identity model

### Event identity priority order
1. official Odds API event ID
2. source-specific secondary ids if present (`includeSids` etc.)
3. derived matchup/time fallback only when source event ID is absent

Required fields to store:
- `source`
- `source_sport_key`
- `source_event_id`
- `source_event_id_kind`
- `commence_time`
- `home_team`
- `away_team`
- `rotation_number_home` if available
- `rotation_number_away` if available

### Bookmaker identity
Use bookmaker `key` as canonical source bookmaker identifier.
Store title as display-only metadata.

### Market identity
Use source market `key` as the primary external identifier.
Examples:
- `h2h`
- `spreads`
- `totals`
- `player_points`
- `player_assists`
- `h2h_q1`

Never infer canonical market family from display text if a source market key exists.

### Participant identity
Priority order:
1. source participant id where available
2. source participant description/name plus source market key plus sport
3. internal normalized participant key

Note:
- `/participants` helps for team/individual whitelists by sport
- it does not replace roster/player identity systems for team-sport props

## Taxonomy rules

### Rule 1: Source market key is primary
Examples:
- `h2h` -> moneyline
- `spreads` -> spread
- `totals` -> total
- `h2h_q1` -> first quarter moneyline
- `player_points` -> player points

### Rule 2: Descriptions are secondary
Use outcome `description` to identify participant names only after market family is already determined by source key.

### Rule 3: No blind substring classification across sports
Examples of bad logic:
- `if prop.includes("goals")`
- `if marketName.includes("points")`

These must not be the backbone because:
- NBA `fieldGoalsMade` is not NHL goals
- NFL field goals are not NBA field goals made
- shots mean different things by sport

### Rule 4: Unknown is allowed
If source key is unsupported or ambiguous:
- map to `unknown`
- attach raw source fields
- mark for taxonomy review
- do not silently coerce into the closest known bucket

## Settlement model

### Team markets
Primary settlement inputs:
- `/scores` event status and final scores where available
- other verified sport/stat rails if `/scores` coverage is incomplete

### Player props
Do not assume `/scores` is sufficient.
Need sport-specific stat truth sources for:
- NBA points/rebounds/assists etc.
- NHL shots/goals/hits
- MLB strikeouts/total bases/home runs
- NFL passing/rushing/receiving props

### Settlement confidence levels
Store a confidence/source layer such as:
- `verified_source_primary`
- `verified_source_fallback`
- `source_limited`
- `manual_review`
- `ungradeable`

## Quota strategy

### Cheap endpoints
- `/sports` = free
- `/events` = free
- `/historical/events` = 1
- `/event-markets` = 1
- `/participants` = 1
- `/scores` = 1 or 2

### Expensive endpoints
- `/odds` = markets x regions
- `/event-odds` = unique markets returned x regions
- `/historical/odds` = 10 x markets x regions
- `/historical/event-odds` = 10 x unique markets returned x regions

### Quota rules for Goosalytics
1. Use the cheapest identity endpoint before expensive odds endpoints.
2. Default to one region unless broader regional coverage is truly required.
3. Use broad historical odds for featured-market sweeps.
4. Use historical event odds only for targeted enrichment.
5. Persist and reuse `previous_timestamp` and `next_timestamp` to walk snapshots deterministically.
6. Record `x-requests-remaining`, `x-requests-used`, `x-requests-last` for observability.
7. Empty responses are valuable because they can establish non-coverage without quota burn.

## Recommended implementation order

### Phase 1: formal source contract
- adopt official sport keys
- adopt official event IDs as primary identity
- adopt official market keys as primary taxonomy rail
- add explicit unknown/unmapped handling

### Phase 2: live ingestion hardening
- `/events` -> event registry
- `/odds` -> broad market capture
- `/scores` -> settlement/status refresh
- targeted `/event-markets` and `/event-odds`

### Phase 3: historical warehouse hardening
- `/historical/events` -> historical identity registry
- `/historical/odds` -> broad featured-market backfill
- targeted `/historical/event-odds` -> props and deep enrichment

### Phase 4: grading and analytics improvement
- separate settlement truth from odds truth
- separate team-market grading from player-prop grading
- use event-level histories to support opener/closer/line movement analysis

## Hard recommendations

1. Build around the documented Odds API contract now that paid access exists.
2. Stop using substring heuristics as the primary classifier.
3. Promote event ID and market key to first-class warehouse fields everywhere.
4. Use historical events + historical odds as the default historical backbone.
5. Use historical event odds selectively for high-value enrichment, especially props.
6. Treat participants endpoint as support, not a full player-identity solution.
7. Keep NFL historical viability unproven until verified with official historical endpoints under the paid plan.

## Blunt conclusion

We now have enough official surface area to build this the right way.

The failure mode is no longer “we don’t have enough data.”
The failure mode is “we paid for good data and still interpreted it like idiots.”

This spec is how we avoid that.
