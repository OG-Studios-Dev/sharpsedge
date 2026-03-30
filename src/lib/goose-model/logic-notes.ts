// ============================================================
// Goose Signal Lab — Logic Notes & Changelog
//
// Static record of key model decisions, threshold changes, and
// logic milestones. This is operator-readable context — not
// dynamically generated, but honest about what the model does
// and when things changed.
// ============================================================

export type LogicNote = {
  date: string;          // YYYY-MM-DD (approximate)
  version: string;       // e.g. "v1.2"
  title: string;
  body: string;
  impact: "thresholds" | "signals" | "scoring" | "gates" | "engine" | "sports";
  sports?: string[];     // which sports affected, omit = all
};

export const LOGIC_NOTES: LogicNote[] = [
  {
    date: "2026-03-28",
    version: "v1.5",
    title: "PGA near-miss learning metadata added",
    body: "Golf picks now capture near-miss context (e.g. top-5 finish with +280 odds) to improve future scoring. Knapp odds corrected from -110 to +280 — this improves historical accuracy of signal weight calculations for PGA outrights.",
    impact: "signals",
    sports: ["PGA"],
  },
  {
    date: "2026-03-27",
    version: "v1.4",
    title: "Pick quality gate + grade lookback window",
    body: "Grading now uses a fixed lookback window to avoid polluting signal weights with stale results. golf_odds_snapshots table added for PGA. Null sportsbook entries now handled gracefully.",
    impact: "gates",
    sports: ["PGA", "NHL", "NBA"],
  },
  {
    date: "2026-03-26",
    version: "v1.3",
    title: "Soft pick-count band: 3–5 preferred, max 7 on strong edges",
    body: "Removed forced minimum pick count. Model now targets 3–5 picks per run but can reach 7 when multiple strong-edge signals fire. Hard max at 7. This improves output quality over volume.",
    impact: "thresholds",
  },
  {
    date: "2026-03-25",
    version: "v1.2",
    title: "Golf top-finish odds rail + Bovada Masters filter",
    body: "Added top-10/top-20 finish markets for PGA. Bovada Masters tournament odds are now filtered and deduplicated correctly. PGA outrights minimum odds set at +200.",
    impact: "engine",
    sports: ["PGA"],
  },
  {
    date: "2026-03-20",
    version: "v1.1",
    title: "NBA feature snapshot: DvP, pace, usage surge signals",
    body: "Added NBA-specific signals: opponent defense vs position (DvP rank), pace matchup, usage surge when key teammate is out, back-to-back penalty. These appear in pick detail view and feed into signal weights.",
    impact: "signals",
    sports: ["NBA"],
  },
  {
    date: "2026-03-15",
    version: "v1.0",
    title: "Signal Lab baseline — signal-weight learning engine launched",
    body: "Initial release. Generates picks, tracks signal win rates, supports grading (win/loss/push), and computes weighted signal scores. Sandbox/learning mode uses relaxed thresholds (55% HR, 3% edge). Production mode uses stricter floors. Promotion gates require: signal ≥55% win rate with 10+ appearances, edge ≥3%, hit rate ≥55%, sport ≥20 graded picks, odds ≥-200.",
    impact: "engine",
  },
];

// ── Threshold reference ────────────────────────────────────────

export const THRESHOLD_REFERENCE = {
  learning_mode: {
    label: "Learning mode (relaxed)",
    description: "Used when generating picks for signal research. Lower bar = more picks = faster signal weight convergence.",
    hit_rate_floor: 55,
    edge_floor: 3,
    default_top_n: 10,
    odds_cap: -200,
  },
  production_mode: {
    label: "Production mode (strict)",
    description: "Used when generating picks for production consideration. Higher bar = fewer, higher-confidence picks.",
    hit_rate_floor: 60,
    edge_floor: 5,
    default_top_n: 5,
    odds_cap: -200,
  },
  promotion_gates: {
    label: "Promotion gates (5 required)",
    description: "All 5 gates must pass for a pick pattern to be eligible for production consideration.",
    gates: [
      { name: "Signal appearances", rule: "Signal must appear in ≥10 graded picks" },
      { name: "Signal win rate", rule: "Signal win rate must be ≥55%" },
      { name: "Edge at capture", rule: "Edge ≥3% at time of pick" },
      { name: "Hit rate at capture", rule: "Hit rate ≥55% at time of pick" },
      { name: "Sport sample", rule: "≥20 graded picks in this sport" },
    ],
  },
};
