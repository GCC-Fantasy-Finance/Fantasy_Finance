import { supabase } from "@/lib/supabase";
import {
  getLeagueById,
  getUserRankInLeague,
  getUserRankInSoloLeaderboard,
  withLiveValues,
} from "@/lib/leagues";
import { getPortfoliosByUser } from "@/lib/portfolios";

export type PortfolioCard = {
  portfolio_id: number;
  is_solo: boolean;
  league_id?: number | null;
  is_league_ended?: boolean;
  net_value?: number | null;
  previous_close_value?: number | null;
  reserve_value?: number | null;
  name: string;
  rank?: number | null;
};

export type HomePortfoliosResult = {
  portfolios: PortfolioCard[];
};

const HOME_PORTFOLIOS_CACHE_TTL_MS = 15_000;
const homePortfoliosCache = new Map<
  string,
  { value: HomePortfoliosResult; expiresAt: number }
>();
const inFlightHomePortfoliosRequests = new Map<string, Promise<HomePortfoliosResult>>();

export function getCachedHomePortfolios(userId: string): HomePortfoliosResult | null {
  const cached = homePortfoliosCache.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    homePortfoliosCache.delete(userId);
    return null;
  }
  return cached.value;
}

export function invalidateCachedHomePortfolios(userId?: string) {
  if (!userId) {
    homePortfoliosCache.clear();
    return;
  }
  homePortfoliosCache.delete(userId);
}

/**
 * Fetch home page portfolios with all enrichment data (ranks, league info, live values)
 * Uses caching to prevent refetches when navigating back to the home page.
 */
export async function fetchHomePortfolios(
  userId: string,
  options?: { useCache?: boolean; forceRefresh?: boolean }
): Promise<HomePortfoliosResult> {
  const useCache = options?.useCache !== false;
  const forceRefresh = options?.forceRefresh === true;

  if (useCache && !forceRefresh) {
    const cached = getCachedHomePortfolios(userId);
    if (cached) return cached;
  }

  const inFlight = inFlightHomePortfoliosRequests.get(userId);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const data = await getPortfoliosByUser(userId as unknown as number);
      const rows = (data ?? []) as any[];

      // Ensure a Solo portfolio exists
      const hasSolo = rows.some((r) => r.is_solo === true);
      let working = [...rows];
      if (!hasSolo) {
        const { data: inserted, error: insErr } = await supabase
          .from("Portfolios")
          .insert({
            user_id: userId,
            is_solo: true,
            previous_close_value: 10000,
            reserve_value: 10000,
            last_recalculated: new Date().toISOString(),
          })
          .select(
            "portfolio_id,is_solo,league_id,previous_close_value,reserve_value"
          )
          .maybeSingle();

        if (!insErr && inserted?.portfolio_id) {
          const { error: historyError } = await supabase
            .from("Portfolio Histories")
            .insert([
              {
                portfolio_id: inserted.portfolio_id,
                value: 10000,
              },
            ]);

          if (historyError) {
            throw historyError;
          }
        }

        if (!insErr && inserted) working.unshift(inserted);
      }

      // Enrich with display names and ranks (batched in parallel)
      const leagueIds = Array.from(
        new Set(
          working
            .filter((r) => !r.is_solo && r.league_id)
            .map((r) => Number(r.league_id))
            .filter((leagueId) => Number.isFinite(leagueId))
        )
      );

      const [soloRank, leagueDetails, portfoliosWithNet] = await Promise.all([
        working.some((r) => r.is_solo)
          ? getUserRankInSoloLeaderboard(userId)
          : Promise.resolve(null),
        Promise.all(
          leagueIds.map(async (leagueId) => {
            const [league, rank] = await Promise.all([
              getLeagueById(leagueId),
              getUserRankInLeague(leagueId, userId),
            ]);
            return [
              leagueId,
              {
                name: league?.name ?? "League",
                rank,
                isEnded: Boolean(league?.is_ended),
              },
            ] as const;
          })
        ),
        withLiveValues(
          working.map((r) => ({
            portfolio_id: Number(r.portfolio_id),
            reserve_value: r.reserve_value ?? 0,
          }))
        ),
      ]);

      const leagueInfoById = new Map(leagueDetails);
      const netValueByPortfolioId = new Map(
        portfoliosWithNet.map((portfolio) => [
          Number(portfolio.portfolio_id),
          Number(portfolio.live_value ?? 0),
        ])
      );

      const cards: PortfolioCard[] = working.map((r) => {
        const isSolo = Boolean(r.is_solo);
        const leagueId = r.league_id != null ? Number(r.league_id) : null;
        const leagueInfo =
          leagueId != null ? leagueInfoById.get(leagueId) : null;

        return {
          portfolio_id: Number(r.portfolio_id),
          is_solo: isSolo,
          league_id: leagueId,
          is_league_ended: isSolo ? false : Boolean(leagueInfo?.isEnded),
          net_value:
            netValueByPortfolioId.get(Number(r.portfolio_id)) ??
            Number(r.previous_close_value ?? 0),
          previous_close_value: r.previous_close_value ?? 0,
          reserve_value: r.reserve_value ?? 0,
          name: isSolo ? "Solo" : (leagueInfo?.name ?? "League"),
          rank: isSolo ? soloRank : (leagueInfo?.rank ?? null),
        };
      });

      const result: HomePortfoliosResult = { portfolios: cards };
      homePortfoliosCache.set(userId, {
        value: result,
        expiresAt: Date.now() + HOME_PORTFOLIOS_CACHE_TTL_MS,
      });

      return result;
    } catch (err) {
      console.error("Failed to fetch home portfolios:", err);
      const emptyResult: HomePortfoliosResult = { portfolios: [] };
      homePortfoliosCache.set(userId, {
        value: emptyResult,
        expiresAt: Date.now() + HOME_PORTFOLIOS_CACHE_TTL_MS,
      });
      return emptyResult;
    }
  })();

  inFlightHomePortfoliosRequests.set(userId, request);

  try {
    return await request;
  } finally {
    inFlightHomePortfoliosRequests.delete(userId);
  }
}
