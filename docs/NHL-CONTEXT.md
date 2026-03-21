# NHL context foundation

This repo now ships a first NHL context rail built around two cheap, reusable inputs:

1. **MoneyPuck-backed team snapshot** for broad team-strength context
2. **Derived schedule/standings scaffolding** for rest, travel, and playoff-pressure context

## Current sources

### Sourced inputs
- **NHL API (`api-web.nhle.com/v1`)**
  - today/upcoming schedule
  - team standings
  - club season schedules used to derive rest/travel density
- **MoneyPuck-backed team snapshot**
  - primary runtime path: a public GitHub mirror that refreshes a MoneyPuck team CSV daily
  - fallback path: bundled local startup snapshot in `data/nhl/moneypuck-team-context.snapshot.json`

## Cadence / freshness
- **Schedule + standings:** request-time with short cache
- **MoneyPuck snapshot:** slower cache; daily-ish is good enough for this rail
- The API response includes source/freshness metadata so downstream consumers can see what was live vs fallback.

## What this rail is for
- Quick team-strength context without expensive vendor lock-in
- Honest support data for qualifier boards, matchup cards, and internal system tracking
- Reusable derived context around:
  - rest days / back-to-backs
  - schedule density
  - travel distance / timezone jump
  - simple stretch-run playoff pressure heuristic

## What is intentionally out of scope
- No fake coach sentiment
- No invented locker-room or morale labels
- No injury/news inference from thin air
- No “must-win” claims unless the rule is explicitly derived and labeled as such
- No full playoff clinch math or tie-breaker engine yet

## Current honesty rules
- Keep **sourced** and **derived** fields separate in outputs.
- Label playoff pressure as a **heuristic** until a stricter standings model exists.
- Treat MoneyPuck input as a team snapshot, not as a full game prediction model.

## Follow-up ideas
- Replace the mirror path with a first-party MoneyPuck ingest if runtime access becomes reliable.
- Add stricter wildcard / tie-breaker logic for late-season urgency.
- Layer in goalie confirmation and injury/news rails separately rather than blending them into this module.
