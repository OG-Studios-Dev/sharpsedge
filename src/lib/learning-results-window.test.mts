import assert from "node:assert/strict";
import test from "node:test";
import learningWindow from "./learning-results-window.ts";

const { filterLearningRowsToCutoff, learningResultsCutoff } = learningWindow;

test("learningResultsCutoff includes the next local NFL slate across UTC midnight", () => {
  assert.equal(learningResultsCutoff(new Date("2026-09-09T01:00:00Z"), "America/Toronto", 2), "2026-09-10");
});

test("filterLearningRowsToCutoff removes leaked future pending picks", () => {
  const rows = [
    { pick_date: "2026-09-10", id: "opening" },
    { pick_date: "2026-10-04", id: "future" },
  ];
  assert.deepEqual(filterLearningRowsToCutoff(rows, "2026-09-10"), [rows[0]]);
});
