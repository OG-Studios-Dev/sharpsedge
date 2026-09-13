import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import systemsRefreshAuth from "./systems-refresh-auth.ts";

const { authorizeSystemsMutation, parseSystemsRefreshDate } = systemsRefreshAuth;
const route = readFileSync("src/app/api/systems/refresh/route.ts", "utf8");

test("systems refresh mutations fail closed unless the cron bearer token matches", () => {
  assert.equal(authorizeSystemsMutation(null, undefined), false);
  assert.equal(authorizeSystemsMutation("Bearer wrong", "expected"), false);
  assert.equal(authorizeSystemsMutation("expected", "expected"), false);
  assert.equal(authorizeSystemsMutation("Bearer expected", "expected"), true);
});

test("systems refresh date accepts only real YYYY-MM-DD calendar dates", () => {
  assert.equal(parseSystemsRefreshDate(null), undefined);
  assert.equal(parseSystemsRefreshDate("2026-09-13"), "2026-09-13");
  assert.throws(() => parseSystemsRefreshDate("2026-9-13"), /YYYY-MM-DD/);
  assert.throws(() => parseSystemsRefreshDate("2026-02-31"), /valid calendar date/);
  assert.throws(() => parseSystemsRefreshDate("$(touch /tmp/nope)"), /YYYY-MM-DD/);
});

test("both mutating systems refresh handlers enforce auth and date validation", () => {
  assert.match(route, /authorizeSystemsMutation/);
  assert.match(route, /parseSystemsRefreshDate/);

  const getBody = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  const postBody = route.slice(route.indexOf("export async function POST"));
  assert.match(getBody, /if \(!authorized\)/);
  assert.match(postBody, /if \(!authorized\)/);
});
