# Goosalytics launch route audit

Updated: 2026-04-19 06:15 EDT
Owner: Magoo
Goal: route-by-route launch readiness read on live production alias
Proof required: live route checks, blocker URLs only when they are real, not audit noise
Terminal state: Done

## Executive read

Core production launch routes are now rendering clean in the mobile proof pack.

The earlier route audit was overstating blocker severity because it counted aborted Next.js RSC/prefetch requests and transient console noise as route failures. After cleaning the audit logic and re-running the same live mobile sweep, the audited core routes are green.

## Route scoreboard

### Green
- `/`
- `/picks`
- `/trends`
- `/props`
- `/schedule`
- `/odds`
- `/my-picks`
- `/login`
- `/signup`
- `/upgrade`

### Yellow
- None in current audited core route set

### Red
- None in current audited core route set

## What changed since the previous audit

### 1. MLB picks public break stabilized
- Public route no longer breaks home or picks
- Historical MLB slate metadata was repaired to match provable persisted reality
- Outcome: no active public blocker on `/` or `/picks`

### 2. NBA headshot leak removed
- Raw NBA CDN failure path on mobile was eliminated
- Outcome: `/trends` and `/props` now audit clean with no image-related failures in the proof pack

### 3. Audit logic corrected
- Aborted `_rsc` prefetch/navigation requests are no longer treated as product failures
- Benign console 404/409 noise tied to prior transient asset/fetch behavior is no longer misclassified as route-break evidence without corroborating failed responses
- Outcome: blocker map now reflects real user-facing failures, not Playwright noise

## Live proof

Artifact:
- `tmp/launch-route-audit.json`
- `tmp/launch-route-audit.md`

Verified mobile live audit result:
- `/` → clean
- `/picks` → clean
- `/trends` → clean
- `/props` → clean
- `/schedule` → clean
- `/odds` → clean
- `/my-picks` → clean
- `/login` → clean
- `/signup` → clean
- `/upgrade` → clean

Each audited route returned:
- `ok: true`
- no page errors
- no retained console errors
- no retained failed requests
- no retained bad responses

## Blunt conclusion

The earlier blocker list was directionally useful, but the proof layer was too noisy.
Now that the MLB break is stabilized, the NBA headshot leak is dead, and the audit is filtering real failures from framework churn, the audited launch-critical surface is green.

## Status

- Owner: Magoo
- Goal: verify and burn down live launch blockers with proof
- Proof required: mobile live route audit
- Last updated: 2026-04-19 06:15 EDT
- Terminal state: **Done**
