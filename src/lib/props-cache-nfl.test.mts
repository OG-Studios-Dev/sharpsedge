import assert from "node:assert/strict";
import test from "node:test";
import propsCache from "./props-cache.ts";

const { filterPropEventsByHorizon, mapWithConcurrency } = propsCache;

test("NFL prop collection ignores events beyond the next eight days", () => {
  const events = [
    { id: "soon", commence_time: "2026-09-13T17:00:00Z" },
    { id: "unix", commenceTime: "1789318800" },
    { id: "edge", commence_time: "2026-09-20T15:59:59Z" },
    { id: "later", commence_time: "2026-09-21T17:00:00Z" },
    { id: "started", commence_time: "2026-09-12T15:00:00Z" },
  ];
  assert.deepEqual(
    filterPropEventsByHorizon(events, "2026-09-12T16:00:00Z", 8).map((event: { id: string }) => event.id),
    ["soon", "unix", "edge"],
  );
});

test("prop event requests are bounded instead of launched all at once", async () => {
  let active = 0;
  let maxActive = 0;
  const values = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value: number) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.equal(maxActive, 2);
  assert.deepEqual(values, [2, 4, 6, 8, 10, 12]);
});
