import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nflSystemState from "./nfl-system-state.ts";

const { nflHandleActiveState, nflHandleUnavailableState } = nflSystemState;

test("NFL handle system reports offseason before September", () => {
  const state = nflHandleUnavailableState("2026-08-20");
  assert.match(state.snapshot, /OFF-SEASON/);
  assert.equal(state.automationStatusLabel, "Wired — dormant off-season");
});

test("NFL handle system reports missing live data during the season instead of offseason", () => {
  const state = nflHandleUnavailableState("2026-09-09");
  assert.doesNotMatch(state.snapshot, /OFF-SEASON/);
  assert.match(state.snapshot, /handle data/i);
  assert.equal(state.automationStatusLabel, "Wired — awaiting live handle data");
});

test("NFL handle system reports an active scan during the season even with zero qualifiers", () => {
  const state = nflHandleActiveState({
    gamesScanned: 1,
    notAvailable: 1,
    notUnderdog: 0,
    notMajorityHandle: 0,
    qualified: 0,
  });
  assert.doesNotMatch(state.snapshot, /OFF-SEASON/);
  assert.match(state.snapshot, /No NFL picks today/);
  assert.equal(state.automationStatusLabel, "Live NFL handle screen");
});

test("NFL system catalog copy describes the live in-season rail without stale kickoff promises", () => {
  const source = readFileSync(new URL("./systems-tracking-store.ts", import.meta.url), "utf8");
  const start = source.indexOf("id: NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID");
  const end = source.indexOf("records: []", start);
  const nflSection = source.slice(start, end);
  assert.doesNotMatch(nflSection, /regular season resumes|auto-activate|dormant/i);
  assert.match(nflSection, /scanned daily/i);
});
