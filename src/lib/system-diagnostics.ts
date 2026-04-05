/**
 * system-diagnostics.ts
 *
 * Reusable verification/diagnostics pattern for live betting systems.
 *
 * Each live system (MLB F5, NHL team ML, NBA player props, PGA top finish)
 * can expose whether its required inputs are present, missing, stale, or
 * blocked BEFORE qualification logic runs. This lets us:
 *   - Surface blockers in admin dashboards without running the full pipeline
 *   - Annotate generated picks with input confidence
 *   - Gate on data quality at the right level of granularity
 *
 * Design principles:
 *   - Degraded service > no service: we annotate but don't hard-block picks
 *   - Each sport implements its own diagnose*Inputs() using this interface
 *   - Builds on the existing SourceHealthCheck types in source-health.ts
 *   - Practical and flat: no class hierarchies, just typed functions
 */

// ── Input status ───────────────────────────────────────────────────────────

/**
 * Status of a single required input to a live system.
 *
 * present  — data is available and fresh
 * missing  — no data at all (never fetched or fetch returned empty)
 * stale    — data exists but is older than the acceptable threshold
 * blocked  — source is fundamentally unavailable (API key missing, source down)
 */
export type SystemInputStatus = "present" | "missing" | "stale" | "blocked";

/**
 * A single required input to a live system.
 * Describes one piece of data the system needs before it can qualify picks.
 */
export interface SystemInput {
  /** Machine-readable name (e.g. "probable_pitcher", "f5_market", "dg_cache") */
  key: string;
  /** Human-readable label */
  label: string;
  /** Current status of this input */
  status: SystemInputStatus;
  /** Whether this input is required for picks to qualify (vs. enrichment-only) */
  required: boolean;
  /** Optional detail string (age, count, error message) */
  detail?: string;
  /** Optional age in minutes if fetchedAt is known */
  ageMinutes?: number | null;
  /** Threshold in minutes before this input is considered stale */
  staleThresholdMinutes?: number;
}

/**
 * Result of diagnosing a live system's input readiness for a specific context.
 * A "context" can be a game, a player, a team pair, etc.
 */
export interface SystemDiagnosticResult {
  /** Which system this covers (e.g. "mlb-f5", "nhl-team-ml", "pga-top10") */
  system: string;
  /** Human-readable system name */
  systemLabel: string;
  /** Which sport this system belongs to */
  sport: "MLB" | "NHL" | "NBA" | "PGA" | "NFL" | "SOCCER";
  /** Context identifier (game ID, player name, matchup string) */
  contextKey: string;
  /** All inputs that were checked */
  inputs: SystemInput[];
  /** Overall qualification status — can the pick quality logic run? */
  qualificationStatus: "ready" | "degraded" | "blocked";
  /** Whether required inputs are satisfied (qualification can proceed) */
  canQualify: boolean;
  /** Required inputs that are missing or blocked */
  blockers: string[];
  /** Optional inputs that are missing or stale (enrichment gaps) */
  enrichmentGaps: string[];
  /** ISO timestamp of when this diagnostic was run */
  diagnosedAt: string;
}

// ── Core utilities ─────────────────────────────────────────────────────────

/**
 * Derive overall qualification status from a set of inputs.
 * - blocked: any required input is blocked
 * - degraded: any required input is missing or stale (but not blocked)
 * - ready: all required inputs are present
 */
export function deriveQualificationStatus(
  inputs: SystemInput[],
): "ready" | "degraded" | "blocked" {
  const required = inputs.filter((i) => i.required);

  const anyBlocked = required.some((i) => i.status === "blocked");
  if (anyBlocked) return "blocked";

  const anyDegraded = required.some(
    (i) => i.status === "missing" || i.status === "stale",
  );
  if (anyDegraded) return "degraded";

  return "ready";
}

/**
 * Build a full SystemDiagnosticResult from inputs.
 * The canQualify flag is true even when status is "degraded" — degraded means
 * some enrichment inputs are missing, but required inputs are present enough
 * to run qualification. Only "blocked" returns canQualify=false.
 */
export function buildSystemDiagnostic(params: {
  system: string;
  systemLabel: string;
  sport: SystemDiagnosticResult["sport"];
  contextKey: string;
  inputs: SystemInput[];
}): SystemDiagnosticResult {
  const status = deriveQualificationStatus(params.inputs);
  const canQualify = status !== "blocked";

  const required = params.inputs.filter((i) => i.required);
  const optional = params.inputs.filter((i) => !i.required);

  const blockers = required
    .filter((i) => i.status === "missing" || i.status === "blocked")
    .map((i) => i.key);

  const enrichmentGaps = optional
    .filter((i) => i.status === "missing" || i.status === "stale")
    .map((i) => i.key);

  return {
    system: params.system,
    systemLabel: params.systemLabel,
    sport: params.sport,
    contextKey: params.contextKey,
    inputs: params.inputs,
    qualificationStatus: status,
    canQualify,
    blockers,
    enrichmentGaps,
    diagnosedAt: new Date().toISOString(),
  };
}

/**
 * Quick helper: create a "present" input.
 */
export function inputPresent(
  key: string,
  label: string,
  detail?: string,
  required = true,
  ageMinutes?: number | null,
): SystemInput {
  return { key, label, status: "present", required, detail, ageMinutes };
}

/**
 * Quick helper: create a "missing" input.
 */
export function inputMissing(
  key: string,
  label: string,
  detail?: string,
  required = true,
): SystemInput {
  return { key, label, status: "missing", required, detail };
}

/**
 * Quick helper: create a "stale" input.
 */
export function inputStale(
  key: string,
  label: string,
  ageMinutes: number,
  staleThresholdMinutes: number,
  required = false,
): SystemInput {
  return {
    key,
    label,
    status: "stale",
    required,
    detail: `Age: ${ageMinutes}m (threshold: ${staleThresholdMinutes}m)`,
    ageMinutes,
    staleThresholdMinutes,
  };
}

/**
 * Quick helper: create a "blocked" input.
 */
export function inputBlocked(
  key: string,
  label: string,
  reason: string,
  required = true,
): SystemInput {
  return { key, label, status: "blocked", required, detail: reason };
}

/**
 * Smart input builder: derives status from presence/staleness.
 * Handles the common case of "do I have this value, and is it fresh?"
 */
export function buildInput(params: {
  key: string;
  label: string;
  required: boolean;
  value: unknown;
  /** If provided, checks whether the value is considered stale */
  fetchedAtIso?: string | null;
  staleThresholdMinutes?: number;
  /** If set and value is falsy, treat as blocked rather than missing */
  blockedReason?: string;
  detail?: string;
}): SystemInput {
  const {
    key,
    label,
    required,
    value,
    fetchedAtIso,
    staleThresholdMinutes,
    blockedReason,
    detail,
  } = params;

  const hasValue = value !== null && value !== undefined && value !== "";

  if (!hasValue) {
    if (blockedReason) return inputBlocked(key, label, blockedReason, required);
    return inputMissing(key, label, detail, required);
  }

  // Value is present — check if stale
  if (fetchedAtIso && staleThresholdMinutes) {
    const ageMs = Date.now() - new Date(fetchedAtIso).getTime();
    const ageMinutes = Math.round(ageMs / 60000);
    if (ageMinutes > staleThresholdMinutes) {
      return inputStale(key, label, ageMinutes, staleThresholdMinutes, required);
    }
    return { key, label, status: "present", required, detail: detail ?? `Age: ${ageMinutes}m`, ageMinutes };
  }

  return { key, label, status: "present", required, detail };
}

// ── Summarize across systems ───────────────────────────────────────────────

export interface SystemsDiagnosticSummary {
  totalSystems: number;
  readySystems: number;
  degradedSystems: number;
  blockedSystems: number;
  canQualifyCount: number;
  overallStatus: "ready" | "degraded" | "blocked";
  blockedSystemKeys: string[];
  degradedSystemKeys: string[];
}

/**
 * Summarize a set of system diagnostics into an aggregate status.
 */
export function summarizeSystemDiagnostics(
  results: SystemDiagnosticResult[],
): SystemsDiagnosticSummary {
  const ready = results.filter((r) => r.qualificationStatus === "ready").length;
  const degraded = results.filter((r) => r.qualificationStatus === "degraded").length;
  const blocked = results.filter((r) => r.qualificationStatus === "blocked").length;
  const canQualifyCount = results.filter((r) => r.canQualify).length;

  const overallStatus: "ready" | "degraded" | "blocked" =
    blocked > 0 ? "blocked" : degraded > 0 ? "degraded" : "ready";

  return {
    totalSystems: results.length,
    readySystems: ready,
    degradedSystems: degraded,
    blockedSystems: blocked,
    canQualifyCount,
    overallStatus,
    blockedSystemKeys: results
      .filter((r) => r.qualificationStatus === "blocked")
      .map((r) => r.system),
    degradedSystemKeys: results
      .filter((r) => r.qualificationStatus === "degraded")
      .map((r) => r.system),
  };
}
