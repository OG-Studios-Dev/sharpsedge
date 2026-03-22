export type SourceHealthStatus = "healthy" | "stale" | "degraded" | "missing";

export type SourceHealthCheck = {
  key: string;
  label: string;
  status: SourceHealthStatus;
  detail: string;
  fetchedAt?: string | null;
  staleAfter?: string | null;
  lastSuccessAt?: string | null;
  ageMinutes?: number | null;
  missingFields?: string[];
};

export type SourceHealthSummary = {
  status: SourceHealthStatus;
  checks: SourceHealthCheck[];
  degradedCount: number;
  staleCount: number;
  missingCount: number;
};

export function parseIsoTimestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getAgeMinutes(value?: string | null, now = Date.now()) {
  const parsed = parseIsoTimestamp(value);
  if (!parsed) return null;
  return Math.max(0, Math.round((now - parsed.getTime()) / 60000));
}

export function isPastIso(value?: string | null, now = Date.now()) {
  const parsed = parseIsoTimestamp(value);
  if (!parsed) return false;
  return parsed.getTime() <= now;
}

export function deriveHealthStatus(params: {
  fetchedAt?: string | null;
  staleAfter?: string | null;
  missingFields?: string[];
  degraded?: boolean;
  allowStaleWithoutFetch?: boolean;
}) : SourceHealthStatus {
  const missingCount = params.missingFields?.filter(Boolean).length ?? 0;
  if (missingCount > 0) return "degraded";
  if (params.degraded) return "degraded";
  if (params.staleAfter && isPastIso(params.staleAfter)) return "stale";
  if (!params.fetchedAt && !params.allowStaleWithoutFetch) return "missing";
  return "healthy";
}

export function buildSourceHealthCheck(input: {
  key: string;
  label: string;
  detail: string;
  fetchedAt?: string | null;
  staleAfter?: string | null;
  lastSuccessAt?: string | null;
  missingFields?: string[];
  degraded?: boolean;
  allowStaleWithoutFetch?: boolean;
}) : SourceHealthCheck {
  return {
    key: input.key,
    label: input.label,
    status: deriveHealthStatus(input),
    detail: input.detail,
    fetchedAt: input.fetchedAt ?? null,
    staleAfter: input.staleAfter ?? null,
    lastSuccessAt: input.lastSuccessAt ?? input.fetchedAt ?? null,
    ageMinutes: getAgeMinutes(input.fetchedAt),
    missingFields: input.missingFields?.filter(Boolean) ?? [],
  };
}

const STATUS_ORDER: Record<SourceHealthStatus, number> = {
  healthy: 0,
  stale: 1,
  degraded: 2,
  missing: 3,
};

export function summarizeSourceHealth(checks: SourceHealthCheck[]): SourceHealthSummary {
  const staleCount = checks.filter((check) => check.status === "stale").length;
  const degradedCount = checks.filter((check) => check.status === "degraded").length;
  const missingCount = checks.filter((check) => check.status === "missing").length;
  const status = checks.reduce<SourceHealthStatus>((worst, check) => {
    return STATUS_ORDER[check.status] > STATUS_ORDER[worst] ? check.status : worst;
  }, "healthy");

  return {
    status,
    checks,
    degradedCount,
    staleCount,
    missingCount,
  };
}
