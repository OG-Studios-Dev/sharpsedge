// ============================================================
// Goose AI Picks Model — reasoning signal tagger
// Parses pick reasoning text to extract which signals were present.
// ============================================================

import { GOOSE_SIGNALS, GooseSignal } from "./types";

// Each signal has a list of regex patterns to detect it in reasoning text.
const SIGNAL_PATTERNS: Record<GooseSignal, RegExp[]> = {
  home_away_split: [
    /home.*split/i,
    /away.*split/i,
    /road.*record/i,
    /home.*record/i,
    /\b(?:at home|on the road|home record|away record)\b/i,
    /home\/away/i,
  ],
  rest_days: [
    /\brest\b/i,
    /days? off/i,
    /\bfreshleg/i,
    /\bfresh legs/i,
    /\brested\b/i,
  ],
  travel_fatigue: [
    /travel/i,
    /\bfatigue\b/i,
    /back-to-back.*road/i,
    /long.*road trip/i,
    /cross[\s-]country/i,
  ],
  back_to_back: [
    /back[\s-]to[\s-]back/i,
    /\bB2B\b/i,
    /second night/i,
    /second game of/i,
  ],
  streak_form: [
    /streak/i,
    /\bform\b/i,
    /hot.*run/i,
    /\bcold\b/i,
    /\brun\b.*game[s]?/i,
    /win streak/i,
    /losing streak/i,
    /recent winning/i,
    /recent form/i,
  ],
  goalie_news: [
    /goalie/i,
    /\bnetminder\b/i,
    /starter.*confirmed/i,
    /goaltender/i,
    /\bSV%\b/i,
  ],
  lineup_change: [
    /lineup/i,
    /line change/i,
    /role change/i,
    /scratch(?:ed)?/i,
    /inserted/i,
    /starting lineup/i,
    /projected lineup/i,
  ],
  odds_movement: [
    /odds.*moved/i,
    /line.*moved/i,
    /steam/i,
    /reverse line/i,
    /opening.*line/i,
    /line movement/i,
    /odds movement/i,
    /price.*moved/i,
  ],
  public_vs_sharp: [
    /sharp/i,
    /public.*bet/i,
    /public.*money/i,
    /professional.*bet/i,
    /square/i,
    /fade.*public/i,
    /contrarian/i,
  ],
  matchup_edge: [
    /matchup/i,
    /\bedge\b/i,
    /\badvantage\b/i,
    /head[\s-]to[\s-]head/i,
    /\bH2H\b/i,
    /favorable.*matchup/i,
  ],
  weather: [
    /weather/i,
    /wind/i,
    /\brain\b/i,
    /outdoor/i,
    /precipitation/i,
    /dome/i,
    /\bheat\b.*game/i,
  ],
  park_factor: [
    /park factor/i,
    /ballpark/i,
    /hitter[''']?s park/i,
    /pitcher[''']?s park/i,
    /elevation/i,
    /\bCoors\b/i,
  ],
  bullpen_strength: [
    /bullpen/i,
    /closer/i,
    /reliever/i,
    /relief.*pitching/i,
    /pen.*strength/i,
  ],
  injury_news: [
    /injur/i,
    /\bIR\b/i,
    /\bday[\s-]to[\s-]day\b/i,
    /\bdoubtful\b/i,
    /\bquestionable\b/i,
    /\bdid not play\b/i,
    /\bDNP\b/i,
    /\bmissing\b.*game/i,
    /\bout\b.*game/i,
  ],
  // ── NBA-specific patterns ────────────────────────────────
  dvp_advantage: [
    /\bDVP\b/i,
    /defense.*vs.*position/i,
    /weak.*defending/i,
    /\ballow[s]?.*(?:points|rebounds|assists|threes|3-pointer)/i,
    /\bvulnerable.*(?:point|rebound|assist)/i,
    /\bpoor.*perimeter\s*defense/i,
    /favorable.*defensive\s*matchup/i,
    /rank(?:s|ed)?.*(?:last|bottom|worst).*allow/i,
  ],
  pace_matchup: [
    /\bpace\b/i,
    /fast.*pace/i,
    /high.*pace/i,
    /\bpossession[s]?\b/i,
    /up-tempo/i,
    /pace.*advantage/i,
    /more.*possessions/i,
    /\bpace.*game\b/i,
    /\bfull.*court\b/i,
  ],
  usage_surge: [
    /usage.*(?:up|increase|spike|surge|rise)/i,
    /(?:increased|elevated|higher)\s+usage/i,
    /\bload.*(?:increase|up)\b/i,
    /\bvolume.*(?:up|spike|increase)/i,
    /teammate.*out/i,
    /with.*(?:out|absent|miss|dnp)/i,
    /\bstarter\s+out\b/i,
    /\bmore\s+(?:shots|minutes|touches)\b/i,
    /\brole.*expand/i,
    /\bopportunity.*(?:increase|more)\b/i,
  ],
  opponent_3pt_rate: [
    /\b3(?:-point|pt|pm).*(?:allow|rate|concede)/i,
    /opponent.*allow.*(?:three|3)/i,
    /(?:weak|poor)\s+(?:perimeter|3-point)\s*defense/i,
    /\b3pa\s*rate\b/i,
    /high.*3-point.*rate/i,
    /rank.*(?:last|bottom|worst).*three/i,
  ],
};

/**
 * Tag all signals present in a pick's reasoning text.
 * Also optionally scans pick_label for additional context.
 */
export function tagSignals(reasoning: string | null | undefined, pickLabel?: string | null): string[] {
  const text = [reasoning ?? "", pickLabel ?? ""].join(" ");
  if (!text.trim()) return [];

  const found: string[] = [];
  for (const signal of GOOSE_SIGNALS) {
    const patterns = SIGNAL_PATTERNS[signal];
    if (patterns.some((rx) => rx.test(text))) {
      found.push(signal);
    }
  }
  return found;
}

/**
 * Merge two signal arrays, deduplicating.
 */
export function mergeSignals(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}
