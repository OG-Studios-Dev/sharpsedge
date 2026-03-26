// ============================================================
// Goose AI Picks Model — prop-line parser
//
// Parses NBA (and general) player prop pick labels to extract:
//   - The numeric prop line (e.g. 25.5)
//   - The bet direction (over / under / null if unknown)
//   - The prop stat type (Points, Rebounds, Assists, etc.)
//   - Whether this is a combo prop (PRA, Pts+Reb, etc.)
//
// Used by generator.ts to avoid ad-hoc regex scattered through
// the codebase, and to feed cleaner data into pick_snapshot.factors.
// ============================================================

export type PropDirection = "over" | "under" | null;

export type ParsedPropLine = {
  /** The numeric line value (e.g. 25.5). Null if not found. */
  line: number | null;
  /** Bet direction extracted from the label. Null if ambiguous. */
  direction: PropDirection;
  /** Normalised prop type string (e.g. "Points", "Rebounds", "PRA"). Null if unknown. */
  propType: string | null;
  /** True when this is a combo prop (PRA, Pts+Reb, Pts+Ast, Blk+Stl, DD, TD, etc.). */
  isCombo: boolean;
};

// ── Direction patterns ─────────────────────────────────────────

const OVER_PATTERNS = [
  /\bover\b/i,
  /\bo\/u\b.*(?=\d)/i,   // O/U 25.5 — O side
  /\bO\s+(\d)/,           // "O 25.5"
  /\b(\d+(?:\.\d+)?)\+\b/, // "25.5+ Points"
];

const UNDER_PATTERNS = [
  /\bunder\b/i,
  /\bU\s+(\d)/,           // "U 25.5"
];

function detectDirection(label: string): PropDirection {
  // Check explicit over first
  if (OVER_PATTERNS.some((rx) => rx.test(label))) {
    // But if "under" is also present, direction is ambiguous (e.g. "over/under line 25.5")
    if (!UNDER_PATTERNS.some((rx) => rx.test(label))) return "over";
  }
  if (UNDER_PATTERNS.some((rx) => rx.test(label))) return "under";
  return null;
}

// ── Line value extraction ──────────────────────────────────────

/**
 * Extract the most likely numeric prop line from a pick label.
 *
 * Strategy:
 *  1. Look for a number immediately after "Over", "Under", "O", "U" keywords.
 *  2. Look for a number followed by a stat keyword (Points, Reb, Ast, etc.).
 *  3. Fall back to the first decimal number in the string.
 *  4. Return null when nothing numeric is found.
 */
export function extractPropLine(label: string | null | undefined): number | null {
  if (!label) return null;

  // 1. After direction keyword: "Over 25.5", "Under 8", "O 25.5", "U 8.5"
  const afterDirection = label.match(/\b(?:over|under|O|U)\s+(\d+(?:\.\d+)?)\b/i);
  if (afterDirection) return parseFloat(afterDirection[1]);

  // 2. "25.5+ Points" pattern (trailing + means over)
  const trailingPlus = label.match(/\b(\d+(?:\.\d+)?)\+\s*(?:points?|reb|rebounds?|ast|assists?|pts|pra|3pm|blk|stl)/i);
  if (trailingPlus) return parseFloat(trailingPlus[1]);

  // 3. Number immediately before or after a stat keyword
  const beforeStat = label.match(/\b(\d+(?:\.\d+)?)\s+(?:points?|rebounds?|assists?|3-?pointers?|3pm|steals?|blocks?|pra|pts|reb|ast|blk|stl)\b/i);
  if (beforeStat) return parseFloat(beforeStat[1]);

  // 4. First decimal number anywhere (decimal makes it more likely a prop line than game number)
  const decimal = label.match(/\b(\d+\.\d+)\b/);
  if (decimal) return parseFloat(decimal[1]);

  return null;
}

// ── Prop type extraction ───────────────────────────────────────

/** Individual stat categories (checked AFTER combo patterns to avoid false combo misses). */
const INDIVIDUAL_STAT_MAP: Array<[RegExp, string]> = [
  [/\b3[- ]?(?:pm|pt|pointer)s?\b/i,         "3-Pointers Made"],
  [/\bthree[- ]pointers?\b/i,                 "3-Pointers Made"],
  [/\bsteals?\b/i,                            "Steals"],
  [/\bblocks?\b/i,                            "Blocks"],
  [/\brebounds?\b/i,                          "Rebounds"],
  [/\breb\b/i,                                "Rebounds"],
  [/\bassists?\b/i,                           "Assists"],
  [/\bast\b/i,                                "Assists"],
  [/\bpoints?\b/i,                            "Points"],
  [/\bpts\b/i,                                "Points"],
];

/** Combo stat categories — checked FIRST so "Pts+Reb" doesn't fall through to "Points". */
const COMBO_STAT_MAP: Array<[RegExp, string]> = [
  [/\bpts\+reb\+ast\b/i,                      "Pts+Reb+Ast"],
  [/\bpra\b/i,                                "PRA"],
  [/\bpts\+reb\b/i,                           "Pts+Reb"],
  [/\bpts\+ast\b/i,                           "Pts+Ast"],
  [/\breb\+ast\b/i,                           "Reb+Ast"],
  [/\bblk\+stl\b/i,                           "Blk+Stl"],
  [/\bblocks?\s*\+\s*steals?\b/i,             "Blk+Stl"],
  [/double[- ]double/i,                       "Double-Double"],
  [/triple[- ]double/i,                       "Triple-Double"],
];

/**
 * Extract a normalised prop type string from a pick label.
 * Returns null when the stat type can't be determined.
 */
export function extractPropType(label: string | null | undefined): string | null {
  if (!label) return null;

  // Check combo patterns first (they're more specific)
  for (const [rx, name] of COMBO_STAT_MAP) {
    if (rx.test(label)) return name;
  }

  // Then individual stats
  for (const [rx, name] of INDIVIDUAL_STAT_MAP) {
    if (rx.test(label)) return name;
  }

  return null;
}

/** Returns true for any known combo prop type string. */
export function isComboStatType(propType: string | null | undefined): boolean {
  if (!propType) return false;
  const pt = propType.toLowerCase();
  return (
    pt.includes("+") ||
    pt === "pra" ||
    pt === "double-double" ||
    pt === "triple-double" ||
    pt === "blk+stl"
  );
}

// ── Main parser ────────────────────────────────────────────────

/**
 * Parse a player prop pick label into its component parts.
 *
 * @example
 * parsePropLine("Anthony Davis Over 25.5 Points")
 * // → { line: 25.5, direction: "over", propType: "Points", isCombo: false }
 *
 * parsePropLine("LeBron James Pts+Reb+Ast Over 42.5")
 * // → { line: 42.5, direction: "over", propType: "Pts+Reb+Ast", isCombo: true }
 *
 * parsePropLine("Draymond Green Under 8.5 Rebounds")
 * // → { line: 8.5, direction: "under", propType: "Rebounds", isCombo: false }
 */
export function parsePropLine(label: string | null | undefined): ParsedPropLine {
  const propType = extractPropType(label);
  const line = extractPropLine(label);
  const direction = detectDirection(label ?? "");

  return {
    line,
    direction,
    propType,
    isCombo: isComboStatType(propType),
  };
}
