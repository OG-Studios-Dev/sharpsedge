import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/nfl-daily-learning.yml", "utf8");

test("NFL daily workflow refreshes the live NFL system tracker for every priced slate date", () => {
  assert.match(workflow, /for SYSTEM_DATE in \$NFL_SLATE_DATES/);
  assert.match(workflow, /systems\/refresh\?cron=true&systemId=nfl-home-dog-majority-handle&date=\$SYSTEM_DATE/);
});

test("NFL daily workflow captures fresh prices before resolving every priced date in the next seven days", () => {
  assert.match(workflow, /goose_market_events\?select=event_date/);
  assert.match(workflow, /sport=eq\.NFL/);
  assert.match(workflow, /event_date=lte\./);
  assert.match(workflow, /order=event_date\.asc/);
  assert.match(workflow, /NFL_SLATE_DATES=/);
  assert.match(workflow, /\$TARGET_DATE" \$NFL_SLATE_DATES/);

  const captureStep = workflow.indexOf("- name: Capture every available NFL market and source");
  const resolveStep = workflow.indexOf("- name: Resolve priced NFL dates for the next seven days");
  assert.ok(captureStep >= 0, "capture step must exist");
  assert.ok(resolveStep >= 0, "slate-resolution step must exist");
  assert.ok(captureStep < resolveStep, "fresh NFL prices must be captured before resolving the scoring slate");
});

test("daily 13:05 UTC execution keeps weekly NFL picks ready before Saturday noon Toronto time", () => {
  assert.match(workflow, /cron: "5 13 \* \* \*"/);
});

test("manual target date is strictly validated before writing to GITHUB_ENV", () => {
  assert.match(workflow, /target_date must be YYYY-MM-DD/);
  assert.match(workflow, /date -u -d "\$TARGET_DATE" \+%F/);
});

test("NFL daily workflow ships its foundation training dataset", () => {
  assert.match(workflow, /data\/models\/goose-training-examples-nfl-foundation\.json/);
  assert.equal(existsSync("data/models/goose-training-examples-nfl-foundation.json"), true);
});

test("NFL daily workflow scopes scoring, grading, and settlement to NFL", () => {
  assert.match(workflow, /--sport=NFL/);
  assert.match(workflow, /goose2\/grade\?sport=NFL/);
  assert.match(workflow, /settle-goose-learning-shadow-picks\.mjs --lookbackDays=7 --sport=NFL/);
  assert.match(workflow, /approved_by_bucket/);
  assert.doesNotMatch(workflow, /approved_by_sport/);

  const settler = readFileSync("scripts/settle-goose-learning-shadow-picks.mjs", "utf8");
  assert.match(settler, /sport=eq\.\$\{encodeURIComponent\(sport\)\}/);
});

test("NFL daily workflow enforces four team picks while preserving the six-prop ceiling", () => {
  assert.match(workflow, /bucket\.startsWith\("NFL:team-markets:"\)\s*&&\s*Number\(count\) > 4/);
  assert.match(workflow, /bucket\.startsWith\("NFL:player-props:"\)\s*&&\s*Number\(count\) > 6/);
});

test("production secrets are scoped to only steps that need them", () => {
  const jobPrefix = workflow.slice(0, workflow.indexOf("    steps:"));
  assert.doesNotMatch(jobPrefix, /SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET/);
  assert.doesNotMatch(workflow, /Authorization: Bearer \$\{\{/);
  assert.match(workflow, /CRON_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
});
