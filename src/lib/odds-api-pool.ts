const ODDS_API_KEY_NAMES = [
  "ODDS_API_KEY",
  "ODDS_API_KEY_2",
  "ODDS_API_KEY_3",
  "ODDS_API_KEY_4",
  "ODDS_API_KEY_5",
  "ODDS_API_KEY_6",
] as const;

const EXHAUSTED_COOLDOWN_MS = 30 * 60 * 1000;
const UNAUTHORIZED_COOLDOWN_MS = 60 * 60 * 1000;

export type OddsApiKeyName = typeof ODDS_API_KEY_NAMES[number];

export type OddsApiQuotaSnapshot = {
  checkedAt: string;
  remaining: number | null;
  used: number | null;
  lastCost: number | null;
};

export type OddsApiKeyCandidate = {
  envName: OddsApiKeyName;
  key: string;
  quota: OddsApiQuotaSnapshot | null;
  coolingUntil: string | null;
};

type OddsApiKeyState = OddsApiKeyCandidate & {
  envIndex: number;
  coolingUntilMs: number | null;
  lastUsedAt: number;
};

type OddsApiFetchInit = RequestInit & {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
};

type OddsApiFetchOptions = {
  retryStatuses?: number[];
};

export type OddsApiFetchResult = {
  response: Response;
  quota: OddsApiQuotaSnapshot;
  apiKey: string;
  envName: OddsApiKeyName;
};

const keyState = new Map<string, OddsApiKeyState>();

function normalizeEnv(value?: string) {
  return (value ?? "").replace(/^"|"$/g, "").trim();
}

function parseHeaderNumber(value: string | null) {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getConfiguredKeyStates() {
  const states: OddsApiKeyState[] = [];
  const seen = new Set<string>();

  ODDS_API_KEY_NAMES.forEach((envName, envIndex) => {
    const key = normalizeEnv(process.env[envName]);
    if (!key || key === "your_key_here" || seen.has(key)) return;
    seen.add(key);

    const existing = keyState.get(key);
    if (existing) {
      existing.envName = envName;
      existing.envIndex = envIndex;
      states.push(existing);
      return;
    }

    const created: OddsApiKeyState = {
      envName,
      envIndex,
      key,
      quota: null,
      coolingUntil: null,
      coolingUntilMs: null,
      lastUsedAt: 0,
    };
    keyState.set(key, created);
    states.push(created);
  });

  return states;
}

function isCooling(state: OddsApiKeyState, now = Date.now()) {
  return typeof state.coolingUntilMs === "number" && state.coolingUntilMs > now;
}

function compareKeyHealth(left: OddsApiKeyState, right: OddsApiKeyState) {
  const leftRemaining = left.quota?.remaining;
  const rightRemaining = right.quota?.remaining;
  const leftHasRemaining = typeof leftRemaining === "number";
  const rightHasRemaining = typeof rightRemaining === "number";

  if (leftHasRemaining && rightHasRemaining && leftRemaining !== rightRemaining) {
    return rightRemaining - leftRemaining;
  }

  if (leftHasRemaining !== rightHasRemaining) {
    return leftHasRemaining ? -1 : 1;
  }

  const leftUsed = left.quota?.used;
  const rightUsed = right.quota?.used;
  const leftHasUsed = typeof leftUsed === "number";
  const rightHasUsed = typeof rightUsed === "number";

  if (leftHasUsed && rightHasUsed && leftUsed !== rightUsed) {
    return leftUsed - rightUsed;
  }

  if (left.lastUsedAt !== right.lastUsedAt) {
    return left.lastUsedAt - right.lastUsedAt;
  }

  return left.envIndex - right.envIndex;
}

function toCandidate(state: OddsApiKeyState): OddsApiKeyCandidate {
  return {
    envName: state.envName,
    key: state.key,
    quota: state.quota,
    coolingUntil: state.coolingUntil,
  };
}

function setCooling(state: OddsApiKeyState, durationMs: number) {
  const coolingUntilMs = Date.now() + durationMs;
  state.coolingUntilMs = coolingUntilMs;
  state.coolingUntil = new Date(coolingUntilMs).toISOString();
}

export function readOddsApiQuotaHeaders(headers: Headers): OddsApiQuotaSnapshot {
  return {
    checkedAt: new Date().toISOString(),
    remaining: parseHeaderNumber(headers.get("x-requests-remaining")),
    used: parseHeaderNumber(headers.get("x-requests-used")),
    lastCost: parseHeaderNumber(headers.get("x-requests-last")),
  };
}

export function getOddsApiKeyCandidates() {
  const now = Date.now();
  return getConfiguredKeyStates()
    .filter((state) => !isCooling(state, now))
    .sort(compareKeyHealth)
    .map(toCandidate);
}

export function getOddsApiKeys() {
  return getOddsApiKeyCandidates().map((candidate) => candidate.key);
}

export function recordOddsApiResponse(apiKey: string, response: Response) {
  const quota = readOddsApiQuotaHeaders(response.headers);
  const state = keyState.get(apiKey);

  if (state) {
    state.quota = quota;
    if (response.status === 401) {
      setCooling(state, UNAUTHORIZED_COOLDOWN_MS);
    } else if (response.status === 429 || quota.remaining === 0) {
      setCooling(state, EXHAUSTED_COOLDOWN_MS);
    } else if (response.ok) {
      state.coolingUntil = null;
      state.coolingUntilMs = null;
    }
  }

  return quota;
}

export async function fetchWithOddsApiKeys(
  buildUrl: (apiKey: string) => string,
  init?: OddsApiFetchInit,
  options?: OddsApiFetchOptions,
): Promise<OddsApiFetchResult | null> {
  const retryStatuses = new Set(options?.retryStatuses ?? [401, 429]);
  const attempted = new Set<string>();
  let lastResult: OddsApiFetchResult | null = null;

  for (let attempt = 0; attempt < ODDS_API_KEY_NAMES.length; attempt += 1) {
    const state = getConfiguredKeyStates()
      .filter((candidate) => !attempted.has(candidate.key) && !isCooling(candidate))
      .sort(compareKeyHealth)[0];

    if (!state) break;

    attempted.add(state.key);
    state.lastUsedAt = Date.now();

    const response = await fetch(buildUrl(state.key), init);
    const quota = recordOddsApiResponse(state.key, response);
    const result = {
      response,
      quota,
      apiKey: state.key,
      envName: state.envName,
    } satisfies OddsApiFetchResult;

    if (!response.ok && retryStatuses.has(response.status)) {
      lastResult = result;
      continue;
    }

    return result;
  }

  return lastResult;
}
