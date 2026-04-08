export type DraftKingsLeagueId = string;
export type DraftKingsCategoryId = string | number;
export type DraftKingsSubcategoryId = string | number;

const DK_SPORTSBOOK_NASH_BASE =
  "https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1";

const DEFAULT_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "application/json,text/plain,*/*",
};

export interface DraftKingsParticipant {
  id?: string;
  name: string;
  venueRole?: string;
  type?: string;
  metadata?: Record<string, any>;
}

export interface DraftKingsEvent {
  id: string;
  name: string;
  seoIdentifier?: string;
  startEventDate?: string;
  status?: string;
  participants?: DraftKingsParticipant[];
  [key: string]: any;
}

export interface DraftKingsMarket {
  id: string;
  eventId?: string;
  name: string;
  subcategoryId?: string | number;
  marketType?: {
    id?: string;
    betOfferTypeId?: number;
    name?: string;
  };
  tags?: string[];
  [key: string]: any;
}

export interface DraftKingsSelection {
  id: string;
  marketId?: string;
  label?: string;
  points?: number;
  outcomeType?: string;
  displayOdds?: {
    american?: string;
    decimal?: string;
    fractional?: string;
  };
  participants?: DraftKingsParticipant[];
  [key: string]: any;
}

export interface DraftKingsCategory {
  id: string | number;
  name: string;
  [key: string]: any;
}

export interface DraftKingsSubcategory {
  id: string | number;
  name: string;
  [key: string]: any;
}

export interface DraftKingsSportsContentResponse {
  sports?: any[];
  leagues?: any[];
  events?: DraftKingsEvent[];
  markets?: DraftKingsMarket[];
  selections?: DraftKingsSelection[];
  categories?: DraftKingsCategory[];
  subcategories?: DraftKingsSubcategory[];
  subscriptionPartials?: any[];
  [key: string]: any;
}

export interface DraftKingsOfferSelection {
  label: string;
  oddsAmerican: number | null;
  oddsDecimal: number | null;
  points: number | null;
  outcomeType: string | null;
  participant: string | null;
  raw: DraftKingsSelection;
}

export interface DraftKingsOffer {
  eventId: string;
  eventName: string;
  startTime: string | null;
  status: string | null;
  marketId: string;
  marketName: string;
  subcategoryId: string | number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  selections: DraftKingsOfferSelection[];
  event: DraftKingsEvent | null;
  market: DraftKingsMarket;
}

function makeUrl(path: string) {
  return `${DK_SPORTSBOOK_NASH_BASE}${path}`;
}

export function buildLeagueCategoryUrl(
  leagueId: DraftKingsLeagueId,
  categoryId: DraftKingsCategoryId,
  subcategoryId?: DraftKingsSubcategoryId,
) {
  const base = `/leagues/${leagueId}/categories/${categoryId}`;
  return makeUrl(subcategoryId == null ? base : `${base}/subcategories/${subcategoryId}`);
}

export async function fetchDraftKingsSportsContent(
  leagueId: DraftKingsLeagueId,
  categoryId: DraftKingsCategoryId,
  subcategoryId?: DraftKingsSubcategoryId,
): Promise<DraftKingsSportsContentResponse> {
  const url = buildLeagueCategoryUrl(leagueId, categoryId, subcategoryId);
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`DraftKings sportsbook request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as DraftKingsSportsContentResponse;
}

export function normalizeAmericanOdds(value?: string | null): number | null {
  if (!value) return null;
  const normalized = String(value).replace(/−/g, "-").replace(/\+/g, "+").trim();
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getEventTeams(event?: DraftKingsEvent | null) {
  const home =
    event?.participants?.find((participant) => participant?.venueRole === "Home")?.name ?? null;
  const away =
    event?.participants?.find((participant) => participant?.venueRole === "Away")?.name ?? null;
  return { home, away };
}

export function indexById<T extends { id?: string | number }>(items?: T[] | null) {
  const map = new Map<string, T>();
  for (const item of items ?? []) {
    if (item?.id == null) continue;
    map.set(String(item.id), item);
  }
  return map;
}

export function shapeDraftKingsOffers(payload: DraftKingsSportsContentResponse): DraftKingsOffer[] {
  const eventsById = indexById(payload.events);
  const selectionsByMarket = new Map<string, DraftKingsSelection[]>();

  for (const selection of payload.selections ?? []) {
    if (!selection?.marketId) continue;
    const key = String(selection.marketId);
    const existing = selectionsByMarket.get(key);
    if (existing) existing.push(selection);
    else selectionsByMarket.set(key, [selection]);
  }

  const offers: DraftKingsOffer[] = [];
  for (const market of payload.markets ?? []) {
    const event = market.eventId ? eventsById.get(String(market.eventId)) ?? null : null;
    const teams = getEventTeams(event);
    const selections = (selectionsByMarket.get(String(market.id)) ?? []).map((selection) => ({
      label: selection.label ?? "",
      oddsAmerican: normalizeAmericanOdds(selection.displayOdds?.american),
      oddsDecimal: selection.displayOdds?.decimal
        ? Number.parseFloat(selection.displayOdds.decimal)
        : null,
      points: typeof selection.points === "number" ? selection.points : null,
      outcomeType: selection.outcomeType ?? null,
      participant: selection.participants?.[0]?.name ?? null,
      raw: selection,
    }));

    offers.push({
      eventId: event?.id ?? String(market.eventId ?? ""),
      eventName: event?.name ?? "Unknown Event",
      startTime: event?.startEventDate ?? null,
      status: event?.status ?? null,
      marketId: String(market.id),
      marketName: market.name,
      subcategoryId: market.subcategoryId ?? null,
      homeTeam: teams.home,
      awayTeam: teams.away,
      selections,
      event,
      market,
    });
  }

  return offers;
}

export async function fetchDraftKingsOffers(
  leagueId: DraftKingsLeagueId,
  categoryId: DraftKingsCategoryId,
  subcategoryId?: DraftKingsSubcategoryId,
) {
  const payload = await fetchDraftKingsSportsContent(leagueId, categoryId, subcategoryId);
  return shapeDraftKingsOffers(payload);
}

export const DRAFTKINGS_LEAGUE_IDS = {
  NFL: "88808",
  MLB: "84240",
  NBA: "42648",
  NHL: "42133",
  PGA: "87637",
} as const;

export const DRAFTKINGS_CATEGORY_IDS = {
  MLB_GAME_LINES: 493,
} as const;
