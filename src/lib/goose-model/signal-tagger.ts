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
    // Additional lineup / role continuity patterns
    /\bconfirmed\s+starter\b/i,
    /\bmoving\s+(?:into|to)\s+(?:the\s+)?starting/i,
    /\bpromotion\b.*(?:line|role|slot)/i,
    /\bdemot(?:ed|ion)\b/i,
    /\bfirst\s+line\b/i,
    /\bpower\s+play\s+(?:unit|time|role)/i,
    /\bpp\s+(?:time|unit|role|quarterback)\b/i,
    /\bincreased\s+(?:role|usage|ice\s+time|minutes)\b/i,
    /\bexpanded\s+role\b/i,
    /\brotation\s+(?:change|update|spot)\b/i,
    /\bstarting\s+in\s+place\b/i,
    /\bfilling\s+in\s+for\b/i,
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
    // Additional injury / health patterns
    /\bruled\s+out\b/i,
    /\bsidelined\b/i,
    /\blimited\b.*(?:practice|game|min|minutes)/i,
    /\bnot\s+(?:playing|available)\b/i,
    /\bhealth\s+(?:protocol|issue|concern)\b/i,
    /\bpain\s+(?:management|injection)\b/i,
    /\bload\s+management\b/i,
    /\brest(?:ed|ing)?\b.*(?:game|tonight|matchup)/i,
    /\bspray\b|\bswelling\b|\bsoreness\b/i,
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
    // Injury-triggered surge: "[X] out → [Y] benefits"
    /\bbenefits?\s+(?:from|with)\b.*(?:absence|out|dnp)/i,
    /\b(?:absence|missing)\s+of\b/i,
    /\bstep\s+(?:up|into\s+(?:a\s+)?(?:bigger|larger|starting))/i,
    /\bfill(?:ing)?\s+the\s+(?:void|gap|role)/i,
    /\bpromotion\s+to\s+(?:the\s+)?(?:first|starting|top)/i,
    /\bpoint\s+guard\s+(?:duties|role|responsibilities)\b/i,
    /\bcreation\s+(?:load|duties|responsibility)\b/i,
    /\bmore\s+(?:plays?|looks?|possessions?)\b/i,
  ],
  opponent_3pt_rate: [
    /\b3(?:-point|pt|pm).*(?:allow|rate|concede)/i,
    /opponent.*allow.*(?:three|3)/i,
    /(?:weak|poor)\s+(?:perimeter|3-point)\s*defense/i,
    /\b3pa\s*rate\b/i,
    /high.*3-point.*rate/i,
    /rank.*(?:last|bottom|worst).*three/i,
  ],
  // ── Extended NBA signals ─────────────────────────────────
  minutes_floor: [
    /\bminutes?\s+(?:floor|guarantee|secured|lock(?:ed)?)\b/i,
    /\bstarter\s+(?:confirmed|locked|set)\b/i,
    /\bheavy\s+rotation\b/i,
    /\b(?:30|32|33|34|35|36|37|38|39|40)\+?\s*(?:min|minutes)\b/i,
    /\bplaying\s+(?:big|major|starter)\s+(?:minutes|role)\b/i,
    /\bguaranteed\s+(?:start|minutes|role)\b/i,
  ],
  home_court_edge: [
    /\bhome\s+court\b/i,
    /\bhome\s+advantage\b/i,
    /\bplaying\s+at\s+home\b/i,
    /\b(?:strong|great|good)\s+home\s+(?:record|crowd|atmosphere)\b/i,
    /\bnba\s+home\b/i,
    /\bchasing\s+a?\s*home\s+win\b/i,
  ],
  recent_trend_over: [
    /\btrend(?:ing)?\s+over\b/i,
    /\bover\s+(?:in\s+)?(?:last\s+)?\d+\s*(?:of\s+)?\d+\s*games\b/i,
    /\bhit\s+over.*(?:in\s+)?(?:last\s+)?\d+\s*straight\b/i,
    /\b(?:3|4|5|6|7)\+?\s*(?:consecutive|straight|straight games)\s+over\b/i,
    /\bsurpassed\s+(?:the\s+)?line\s+(?:in\s+)?(?:last\s+)?\d+\s*games\b/i,
    /over\s+in\s+(?:\d+\s*of\s+)?(?:last\s+)?(?:3|4|5|6|7)/i,
  ],
  recent_trend_under: [
    /\btrend(?:ing)?\s+under\b/i,
    /\bunder\s+(?:in\s+)?(?:last\s+)?\d+\s*(?:of\s+)?\d+\s*games\b/i,
    /\bhit\s+under.*(?:in\s+)?(?:last\s+)?\d+\s*straight\b/i,
    /\b(?:3|4|5|6|7)\+?\s*(?:consecutive|straight|straight games)\s+under\b/i,
    /under\s+in\s+(?:\d+\s*of\s+)?(?:last\s+)?(?:3|4|5|6|7)/i,
  ],
  // ── NHL special teams signals ──────────────────────────────
  pp_efficiency_edge: [
    /\bpower[\s-]?play\s+(?:efficiency|advantage|edge|unit)\b/i,
    /\bstrong\s+pp\b/i,
    /\bpp\s+(?:efficiency|advantage|edge)\b/i,
    /\bweak\s+(?:penalty\s+kill|pk)\b/i,
    /\bpenalty\s+kill\s+(?:weakness|struggles|giving up)\b/i,
    /pp\s*%\s+(?:advantage|differential|edge)/i,
    /\bspecial\s+teams\s+(?:advantage|edge|differential)\b/i,
  ],
  goalie_pp_weakness: [
    /\bweak\s+(?:on\s+the\s+)?(?:power[\s-]?play|pp)\b/i,
    /\bgoalie.*(?:weak|poor|bad)\s+(?:on|against)\s+(?:pp|power[\s-]?play)\b/i,
    /\bpp\s+save\s+(?:rate|percentage|pct)\b/i,
    /\bopponent\s+goalie.*pp\b/i,
    /exploitable\s+(?:on|against)\s+pp/i,
  ],
  // ── NHL shot danger zone signals ──────────────────────────────
  shot_danger_edge: [
    /\bhigh[\s-]?danger\s+(?:chances|shots|zone|scoring)\b/i,
    /\bhdcf\b/i,
    /\bslot\s+(?:shots|chances|zone)\b/i,
    /\bdanger[\s-]?zone\s+(?:advantage|edge|dominance)\b/i,
    /\bshot\s+quality\s+(?:advantage|edge|edge)\b/i,
    /\bhigh[\s-]?danger\s+(?:area|attack|rate)\b/i,
    /\bscoring[\s-]?chances?\s+(?:for|advantage|dominance)\b/i,
  ],
  opponent_goalie_hd_weakness: [
    /\bgoalie.*high[\s-]?danger\b/i,
    /\bopponent\s+goalie.*(?:slot|hd|danger\s+zone)\b/i,
    /\bhd\s*sv\s*%\b/i,
    /\bhigh[\s-]?danger\s+save\s+(?:rate|percentage|weakness)\b/i,
    /\bgoalie.*(?:weak|poor|bad)\s+(?:in|from)\s+(?:slot|close|danger)\b/i,
  ],
  // ── MLB pitcher command / K/BB ────────────────────────────
  pitcher_command: [
    /\bk\/bb\b/i,
    /\bstrike[\s-]?out.*walk.*ratio\b/i,
    /\bcommand\b.*(?:pitcher|starter|mound)/i,
    /\bfew(?:er)?\s+walks\b/i,
    /\blow\s+walk\s+rate\b/i,
    /\bhigh\s+strikeout.*walk\b/i,
    /\bpitcher.*control\b/i,
    /\bgood\s+command\b/i,
    /\blimits?\s+(?:free\s+)?(?:baserunners?|walks?)\b/i,
    /\bk\s+rate.*bb\s+rate\b/i,
  ],
  // ── MLB home/away split edge ──────────────────────────────
  home_away_edge: [
    /\bstrong\s+at\s+home\b/i,
    /\bhome\s+win\s+(?:rate|percentage|record)\b/i,
    /\baway\s+win\s+(?:rate|percentage|record)\b/i,
    /\bstruggl(?:es?|ing)\s+on\s+(?:the\s+)?road\b/i,
    /\bpoor\s+(?:away|road)\s+(?:record|team)\b/i,
    /\bsolid\s+home(?:\s+record)?\b/i,
    /\bexcellent\s+(?:home|away)\s+record\b/i,
    /\bhome\/away\s+split\b/i,
    /\bwinning\s+at\s+home\b/i,
  ],
  // ── MLB umpire zone signals ────────────────────────────────
  umpire_pitcher_friendly: [
    /\bumpire.*(?:pitcher[\s-]friendly|tight zone|small zone|low[- ]scoring zone)\b/i,
    /\b(?:HP|home\s+plate)\s+ump(?:ire)?\s+(?:favors?|tight|suppresses?)\b/i,
    /\bumpire\s+(?:zone\s+)?tends?\s+(?:to\s+)?(?:favor|help)\s+pitchers?\b/i,
    /\bpitcher[\s-]friendly\s+(?:zone|ump(?:ire)?)\b/i,
    /\btight\s+strike\s+zone\b/i,
  ],
  umpire_hitter_friendly: [
    /\bumpire.*(?:hitter[\s-]friendly|loose zone|wide zone|high[- ]scoring zone)\b/i,
    /\b(?:HP|home\s+plate)\s+ump(?:ire)?\s+(?:loose|favors?\s+hitters?|expands?)\b/i,
    /\bumpire\s+(?:zone\s+)?tends?\s+(?:to\s+)?(?:favor|help)\s+(?:hitters?|batters?)\b/i,
    /\bhitter[\s-]friendly\s+(?:zone|ump(?:ire)?)\b/i,
    /\bexpanded?\s+strike\s+zone\b/i,
  ],
  // ── MLB handedness advantage ───────────────────────────────
  handedness_advantage: [
    /\bhandedness\s+(?:advantage|edge|matchup)\b/i,
    /\bops\s+vs\s+(?:lhp|rhp|lefty|righty)\b/i,
    /\bteam\s+(?:hits|bats)\s+well\s+(?:vs|against)\s+(?:left|right)[\s-]?handers?\b/i,
    /\bbatting\s+(?:split|splits)\s+(?:vs|against)\s+(?:lhp|rhp|lefties?|righties?)\b/i,
    /\bfavorable\s+(?:pitcher\s+)?hand(?:edness)?\s+matchup\b/i,
    /\bteam\s+(?:advantage|edge)\s+(?:vs|against)\s+(?:lefties?|righties?|lhp|rhp)\b/i,
  ],
  // ── NHL per-player xG quality ──────────────────────────────
  player_shot_quality_edge: [
    /\bxg[\s-]?(?:per[\s-]?game|quality|generators?)\b/i,
    /\bplayer\s+(?:shot\s+)?quality\s+(?:edge|advantage|generators?)\b/i,
    /\btop\s+shooters?\s+(?:generating|outperforming|edge)\b/i,
    /\bshot\s+quality\s+(?:concentrated|concentration|generators?)\b/i,
    /\boffensive\s+player\s+quality\b/i,
    /\bxg\s+generators?\s+(?:edge|advantage|better)\b/i,
    /\bscoring\s+(?:quality\s+)?edge\s+(?:in|from)\s+(?:forwards?|top[\s-]?line)\b/i,
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
