export function normalizeToken(value) {
  return String(value || '').toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function normalizeNullableToken(value) {
  const normalized = normalizeToken(value);
  return normalized || null;
}

export function normalizeDisplayText(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function normalizeSide(value) {
  return normalizeToken(value) || 'unknown';
}

export function normalizeLine(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(1);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed.toFixed(1);
  }
  return 'na';
}

export function normalizeBook(value) {
  return normalizeToken(value) || 'unknown-book';
}

export function normalizeParticipantKey(participantId, participantName) {
  return normalizeNullableToken(participantId) ?? normalizeNullableToken(participantName) ?? 'field';
}

export function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toDateKey(value) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 10) : 'unknown-date';
}

export function toHourBucket(value) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 13) : 'unknown-hour';
}

export function toMinuteBucket(value) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 16) : 'unknown-minute';
}

export function buildGoose2EventId(input) {
  const sport = normalizeToken(input.sport) || 'unknown-sport';
  const league = normalizeToken(input.league) || sport;
  const away = normalizeToken(input.awayTeam);
  const home = normalizeToken(input.homeTeam);
  const normalizedSourceEventId = normalizeToken(input.sourceEventId);
  if (normalizedSourceEventId) return `evt:${sport}:${league}:${normalizedSourceEventId}`;
  if (away && home) return `evt:${sport}:${league}:${away}@${home}:${toHourBucket(input.commenceTime)}`;
  return `evt:${sport}:${league}:${normalizeToken(input.source) || 'unknown-source'}:${toDateKey(input.commenceTime)}`;
}

export function buildGoose2CandidateId(input) {
  return [
    'cand',
    input.eventId,
    normalizeToken(input.marketType) || 'unknown-market',
    normalizeParticipantKey(input.participantId, input.participantName),
    normalizeSide(input.side),
    normalizeLine(input.line),
    normalizeBook(input.book),
    toMinuteBucket(input.captureTs),
  ].join(':');
}

export function inferGoose2MarketType({ marketType, propType }) {
  const market = normalizeToken(marketType);
  const prop = normalizeToken(propType);
  if (market.includes('moneyline') || market === 'ml') return 'moneyline';
  if (market.includes('spread')) return 'spread';
  if (market === 'total' || market === 'totals') return 'total';
  if (prop.includes('points')) return 'player_prop_points';
  if (prop.includes('rebounds')) return 'player_prop_rebounds';
  if (prop.includes('assists')) return 'player_prop_assists';
  if (prop.includes('shots')) return 'player_prop_shots_on_goal';
  if (prop.includes('goals')) return 'player_prop_goals';
  if (prop.includes('hits')) return 'player_prop_hits';
  if (prop.includes('total-bases') || prop.includes('total bases')) return 'player_prop_total_bases';
  if (prop.includes('strikeouts')) return 'player_prop_strikeouts';
  if (prop.includes('home-runs') || prop.includes('home runs')) return 'player_prop_home_runs';
  if (prop.includes('threes') || prop.includes('3-pointers') || prop.includes('3pm')) return 'player_prop_threes';
  if (prop.includes('doubledouble') || prop.includes('double-double')) return 'unknown';
  if (prop.includes('tripledouble') || prop.includes('triple-double')) return 'unknown';
  if (prop.includes('firstbasket') || prop.includes('first basket')) return 'unknown';
  if (prop.includes('firstto20') || prop.includes('first to 20')) return 'unknown';
  if (prop.includes('firstto25') || prop.includes('first to 25')) return 'unknown';
  if (prop.includes('firstto50') || prop.includes('first to 50')) return 'unknown';
  if (prop.includes('firstto75') || prop.includes('first to 75')) return 'unknown';
  return 'unknown';
}
