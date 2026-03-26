// ============================================================
// prop-parser.ts — unit tests
// Run: npx tsx --test src/lib/goose-model/prop-parser.test.mts
// ============================================================

import { parsePropLine, extractPropLine, extractPropType } from "./prop-parser.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

// ── extractPropLine ──────────────────────────────────────────

test("extracts line after Over keyword", () => {
  assert.equal(extractPropLine("LeBron James Over 25.5 Points"), 25.5);
});

test("extracts line after Under keyword", () => {
  assert.equal(extractPropLine("Draymond Green Under 8.5 Rebounds"), 8.5);
});

test("extracts integer line", () => {
  assert.equal(extractPropLine("Anthony Davis Over 30 Points"), 30);
});

test("extracts line with trailing + shorthand", () => {
  assert.equal(extractPropLine("Luka Doncic 35.5+ Points"), 35.5);
});

test("returns null when no number found", () => {
  assert.equal(extractPropLine("Lakers to win"), null);
});

test("extracts decimal from combo prop", () => {
  assert.equal(extractPropLine("Nikola Jokic Pts+Reb+Ast Over 42.5"), 42.5);
});

// ── extractPropType ──────────────────────────────────────────

test("detects Points", () => {
  assert.equal(extractPropType("LeBron James Over 25.5 Points"), "Points");
});

test("detects Rebounds", () => {
  assert.equal(extractPropType("Under 8.5 Rebounds"), "Rebounds");
});

test("detects Assists", () => {
  assert.equal(extractPropType("Over 6.5 Assists"), "Assists");
});

test("detects 3-Pointers Made", () => {
  assert.equal(extractPropType("Over 3.5 3-Pointers Made"), "3-Pointers Made");
  assert.equal(extractPropType("Curry Over 4.5 3PM"), "3-Pointers Made");
});

test("detects PRA combo", () => {
  assert.equal(extractPropType("Jokic Over 42.5 PRA"), "PRA");
});

test("detects Pts+Reb+Ast combo", () => {
  assert.equal(extractPropType("Giannis Over 44.5 Pts+Reb+Ast"), "Pts+Reb+Ast");
});

test("detects Pts+Reb combo before Points", () => {
  assert.equal(extractPropType("Over 38.5 Pts+Reb"), "Pts+Reb");
});

test("detects Blk+Stl combo", () => {
  assert.equal(extractPropType("Over 3.5 Blk+Stl"), "Blk+Stl");
});

test("detects Double-Double", () => {
  assert.equal(extractPropType("To record a double-double"), "Double-Double");
});

test("returns null for team ML picks", () => {
  assert.equal(extractPropType("Lakers to win ML"), null);
});

// ── parsePropLine (full parser) ──────────────────────────────

test("parses full over prop correctly", () => {
  const result = parsePropLine("Anthony Davis Over 25.5 Points");
  assert.equal(result.line, 25.5);
  assert.equal(result.direction, "over");
  assert.equal(result.propType, "Points");
  assert.equal(result.isCombo, false);
});

test("parses full under prop correctly", () => {
  const result = parsePropLine("Draymond Green Under 8.5 Rebounds");
  assert.equal(result.line, 8.5);
  assert.equal(result.direction, "under");
  assert.equal(result.propType, "Rebounds");
  assert.equal(result.isCombo, false);
});

test("marks PRA as combo", () => {
  const result = parsePropLine("Nikola Jokic Over 55.5 PRA");
  assert.equal(result.propType, "PRA");
  assert.equal(result.isCombo, true);
});

test("marks Pts+Reb as combo", () => {
  const result = parsePropLine("Over 38.5 Pts+Reb");
  assert.equal(result.isCombo, true);
});

test("handles null input", () => {
  const result = parsePropLine(null);
  assert.equal(result.line, null);
  assert.equal(result.direction, null);
  assert.equal(result.propType, null);
  assert.equal(result.isCombo, false);
});

test("handles team pick with no stat", () => {
  const result = parsePropLine("Los Angeles Lakers to Win");
  assert.equal(result.line, null);
  assert.equal(result.propType, null);
});

console.log("✓ All prop-parser tests passed");
