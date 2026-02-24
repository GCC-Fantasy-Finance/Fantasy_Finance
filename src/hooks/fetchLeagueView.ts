import { getDraftByLeague, type DraftRow } from "@/lib/drafts";
import { getPortfoliosByLeague } from "@/lib/portfolios";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { supabase } from "@/lib/supabase";

export type LeagueView = {
  league_id: number;
  name: string;
  owner_id?: string;
  created_at?: string;
  finish_time?: string;
};

export type LeagueOwner = {
  id: string;
  username?: string;
  email?: string;
};

export type LeaguePortfolioWithUser = {
  portfolio_id: number;
  previous_close_value: number;
  reserve_value?: number;
  live_value?: number;
  user_id: string;
  Profiles: {
    username?: string;
    avatar_url?: string;
  } | null;
};

export type LeagueViewResult = {
  league: LeagueView | null;
  owner: LeagueOwner | null;
  draft: DraftRow | null;
  leaderboard: LeaguePortfolioWithUser[];
};

const LEAGUE_VIEW_CACHE_TTL_MS = 15_000;
const leagueViewCache = new Map<
  number,
  { value: LeagueViewResult; expiresAt: number }
>();
const inFlightLeagueViewRequests = new Map<number, Promise<LeagueViewResult>>();

export function getCachedLeagueView(leagueId: number): LeagueViewResult | null {
  const cached = leagueViewCache.get(leagueId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    leagueViewCache.delete(leagueId);
    return null;
  }
  return cached.value;
}

export function invalidateCachedLeagueView(leagueId?: number) {
  if (typeof leagueId !== "number") {
    leagueViewCache.clear();
    return;
  }
  leagueViewCache.delete(leagueId);
}

export async function fetchLeagueView(
  leagueId: number,
  options?: { useCache?: boolean; forceRefresh?: boolean }
): Promise<LeagueViewResult> {
  const useCache = options?.useCache !== false;
  const forceRefresh = options?.forceRefresh === true;

  if (useCache && !forceRefresh) {
    const cached = getCachedLeagueView(leagueId);
    if (cached) return cached;
  }

  const inFlight = inFlightLeagueViewRequests.get(leagueId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const { data: leagueData, error: leagueErr } = await supabase
      .from("Leagues")
      .select("league_id,name,owner_id,created_at,finish_time")
      .eq("league_id", leagueId)
      .maybeSingle();

    if (leagueErr || !leagueData) {
      const emptyResult: LeagueViewResult = {
        league: null,
        owner: null,
        draft: null,
        leaderboard: [],
      };
      leagueViewCache.set(leagueId, {
        value: emptyResult,
        expiresAt: Date.now() + LEAGUE_VIEW_CACHE_TTL_MS,
      });
      return emptyResult;
    }

    const [ownerResult, draftData, portfoliosData] = await Promise.all([
      leagueData.owner_id
        ? supabase
            .from("Profiles")
            .select("id, username, email")
            .eq("id", leagueData.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      getDraftByLeague(leagueId),
      getPortfoliosByLeague(leagueId),
    ]);

    const portfolios = (portfoliosData ?? []) as LeaguePortfolioWithUser[];
    const portfolioIds = portfolios.map((portfolio) => portfolio.portfolio_id);

    let holdingsByPortfolio = new Map<
      number,
      Array<{
        quantity?: number | null;
        stock?: { current_price?: number | null };
      }>
    >();

    if (portfolioIds.length > 0) {
      const { data: holdingsRows } = await supabase
        .from("Portfolio Holdings")
        .select("portfolio_id, stock_id, quantity")
        .in("portfolio_id", portfolioIds);

      const stockIds = Array.from(
        new Set(
          (holdingsRows ?? [])
            .map((holding: any) => Number(holding.stock_id))
            .filter((stockId) => Number.isFinite(stockId))
        )
      );

      const stockPricesById = new Map<number, number>();
      if (stockIds.length > 0) {
        const { data: stockRows } = await supabase
          .from("Stocks")
          .select("stock_id, current_price")
          .in("stock_id", stockIds);

        for (const stock of stockRows ?? []) {
          stockPricesById.set(
            Number((stock as any).stock_id),
            Number((stock as any).current_price ?? 0)
          );
        }
      }

      holdingsByPortfolio = (holdingsRows ?? []).reduce(
        (map, holding: any) => {
          const portfolioId = Number(holding.portfolio_id);
          const list = map.get(portfolioId) ?? [];
          list.push({
            quantity: Number(holding.quantity ?? 0),
            stock: {
              current_price: stockPricesById.get(Number(holding.stock_id)) ?? 0,
            },
          });
          map.set(portfolioId, list);
          return map;
        },
        new Map<
          number,
          Array<{
            quantity?: number | null;
            stock?: { current_price?: number | null };
          }>
        >()
      );
    }

    const leaderboard = portfolios
      .map((portfolio) => ({
        ...portfolio,
        live_value: calculatePortfolioValue({
          holdings: holdingsByPortfolio.get(portfolio.portfolio_id) ?? [],
          reserveValue: portfolio.reserve_value,
        }),
      }))
      .sort((a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0));

    const result: LeagueViewResult = {
      league: leagueData as LeagueView,
      owner: (ownerResult.data as LeagueOwner | null) ?? null,
      draft: draftData,
      leaderboard,
    };

    leagueViewCache.set(leagueId, {
      value: result,
      expiresAt: Date.now() + LEAGUE_VIEW_CACHE_TTL_MS,
    });

    return result;
  })();

  inFlightLeagueViewRequests.set(leagueId, request);

  try {
    return await request;
  } finally {
    inFlightLeagueViewRequests.delete(leagueId);
  }
}

export function prefetchLeagueView(leagueId: number) {
  void fetchLeagueView(leagueId, { useCache: true }).catch(() => {
    return;
  });
}

