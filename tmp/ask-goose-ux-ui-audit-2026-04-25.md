# Ask Goose UX/UI + chatbot audit — 2026-04-25

Owner: Magoo
Goal: Verify whether Ask Goose chatbot works and audit UX/UI trust risks.
Proof required: live API probes + source inspection.
Last updated: 2026-04-25 08:23 ET

## Verdict
Partial / not launch-ready.

Ask Goose route and page exist and production responds, but this is not a true LLM/chatbot yet. It is a deterministic query/parser over `ask_goose_query_layer_v1` with a text box UI. It currently returns misleading answers for common questions.

## Proof
- Live page: `GET https://goosalytics.vercel.app/ask-goose` returned HTTP 200, 56,438 bytes, Vercel PRERENDER.
- Dashboard sanity: `GET https://goosalytics.vercel.app/api/dashboard` returned HTTP 200.
- Live API probes:
  - `GET /api/ask-goose?league=NHL&q=NHL home underdogs moneyline record and ROI`
  - `GET /api/ask-goose?league=NHL&q=Who is the best hockey player ever`
  - `GET /api/ask-goose?league=NHL&q=NHL Under 5.5 record and units`
- Source inspected:
  - `src/app/ask-goose/page.tsx`
  - `src/app/api/ask-goose/route.ts`
  - `src/lib/ask-goose/internal-query.ts`

## Critical issues

### 1. Non-betting questions are not rejected
Probe: `Who is the best hockey player ever`
Result: API returned `ok: true` with NHL betting rows and answer `NHL: 9-16-0...`, plus only a warning.
Impact: Violates the product promise: “No generic sports chat.” Users can ask nonsense and still get betting stats.
Required fix: If `looksLikeBettingQuestion === false`, return `ok:false` or `empty:true` with refusal, no evidence rows.

### 2. “Home underdogs” query returns away underdogs and wrong market slices
Probe: `NHL home underdogs moneyline record and ROI`
Observed rows included `Philadelphia Flyers` away at Detroit, `is_home_team_bet:false`, and multiple period/regulation moneyline rows.
Impact: Directly wrong answer. User asked home dogs; app includes away dogs and submarkets.
Required fix: Parse/handle `home` and enforce `is_home_team_bet === true`; default moneyline questions to full-game market only unless period/regulation explicitly requested.

### 3. “Under 5.5” does not enforce line 5.5
Probe: `NHL Under 5.5 record and units`
Observed returned rows were Under 1.5 and Under 3.5 period totals.
Impact: Directly wrong answer.
Required fix: Parse numeric lines and filter `line === 5.5`. Also default total questions to full-game only unless period is specified.

### 4. Duplicate rows inflate samples
The evidence rows include multiple books and multiple snapshots for the same game/market. Summary counts rows, not unique betting decisions.
Impact: Sample size, W/L, units, and ROI are distorted.
Required fix: De-dupe to one canonical pick per `canonical_game_id + market + side + line + scope`, preferably best available closing/opening policy explicitly chosen.

### 5. Units/ROI are dangerous right now
The API uses `profit_units` and `roi_on_10_flat` from raw query rows. Historical odds include suspicious values like `+40000`, `+10000`, `-5000`, and period/regulation variants mixed into full-game questions.
Impact: Can show impossible profitability or misleading ROI.
Required fix: Do not show source units unless odds sanity checks pass. Show flat-risk normalized units separately and label the odds policy.

### 6. UI says “chatbot / natural-language” but behavior is query panel
Current page auto-fetches on every keystroke via `useEffect([sportLeague, question])`. Button says “Refresh persisted data” but only trims the text; it does not refresh backend materialization.
Impact: Feels broken/misleading. Users expect submit/response behavior.
Required fix: Make it an explicit chat/search interaction: input → Ask button → loading → answer card. Rename button.

## UX/UI notes
- Good: visually clear dark premium page, support/reject cards set expectations, evidence table is valuable.
- Bad: answer card is labeled “Internal Ask Goose answer” — not user-facing polish.
- Bad: no confidence/trust badge explaining data filters, dedupe method, odds policy, sample definition.
- Bad: no “I can’t answer that” state; warnings are easy to miss.
- Bad: rows table is too raw for a consumer-facing product; needs game/market normalization and expandable evidence.

## Launch readiness
Not ready for public users.

Safe internal status: “Deterministic Ask Goose query layer prototype is live, but answer correctness is not reliable enough for user-facing betting claims.”

## Recommended next step
Fix answer correctness before UI polish:
1. Add refusal path for non-betting questions.
2. Add parser support for home/away, full-game vs period/regulation, numeric lines, odds ranges.
3. Add canonical de-dupe before summarizing.
4. Add odds sanity/normalized units policy.
5. Then tighten UI into explicit Ask button + answer/evidence flow.
