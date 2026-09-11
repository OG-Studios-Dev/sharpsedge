import assert from "node:assert/strict";
import test from "node:test";
import gradingWindow from "./grading-window.ts";

const { goose2GradeEventDates } = gradingWindow;

test("Goose 2 grading lookback includes the current UTC event date", () => {
  assert.deepEqual(
    goose2GradeEventDates(undefined, 3, new Date("2026-09-10T13:05:00Z")),
    ["2026-09-10", "2026-09-09", "2026-09-08"],
  );
});

test("Goose 2 explicit grading date remains a single-date run", () => {
  assert.deepEqual(
    goose2GradeEventDates("2026-09-10", 7, new Date("2026-09-12T13:05:00Z")),
    ["2026-09-10"],
  );
});
