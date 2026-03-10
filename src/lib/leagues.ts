import { supabase } from "@/lib/supabase";
import { calculatePortfolioValue } from "@/lib/portfolioValue";

/* ================================
   Types
   ================================ */
export type LeagueRow = {
  league_id: number;
  name: string;
  created_at: string;
  start_time: string;
  finish_time: string;
  has_trading: boolean;
  has_drafting: boolean;
  sectors: string[];
  owner_id: string;
  is_ended: boolean;
};

/* ================================
   Fetch league by ID
   ================================ */
export async function getLeagueById(
  leagueId: number
): Promise<LeagueRow | null> {
  const { data, error } = await supabase
    .from("Leagues")
    .select("*")
    .eq("league_id", leagueId)
    .single();

  if (error) {
    console.error("Failed to load league:", error);
    return null;
  }

  return data as LeagueRow;
}

export async function getSectorByLeagueId(
  league_Id: number
): Promise<string[]> {
  const { data: leagueData, error: leagueError } = await supabase
        .from("Leagues")
        .select("sectors")
        .eq("league_id", league_Id)
        .single();
  
      if (leagueError) {
        console.error(leagueError);
        
        return [];
      }
  
      return leagueData?.sectors ?? [];
}

  type PortfolioWithReserve = {
    portfolio_id: number;
    reserve_value?: number | null;
  };

  type LeaderboardPortfolioRow = {
    portfolio_id: number;
    user_id: string;
    reserve_value: number | null;
  };

  export async function withLiveValues<T extends PortfolioWithReserve>(
    portfolios: T[]
  ): Promise<Array<T & { live_value: number }>> {
    const portfolioIds = portfolios
      .map((portfolio) => Number(portfolio.portfolio_id))
      .filter((portfolioId) => Number.isFinite(portfolioId));

    if (portfolioIds.length === 0) {
      return portfolios.map((portfolio) => ({
        ...portfolio,
        live_value: calculatePortfolioValue({
          holdings: [],
          reserveValue: portfolio.reserve_value,
        }),
      }));
    }

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

    const holdingsByPortfolio = (holdingsRows ?? []).reduce(
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

    return portfolios.map((portfolio) => ({
      ...portfolio,
      live_value: calculatePortfolioValue({
        holdings: holdingsByPortfolio.get(portfolio.portfolio_id) ?? [],
        reserveValue: portfolio.reserve_value,
      }),
    }));
  }

  export async function buildSortedLeaderboardEntries<
    T extends PortfolioWithReserve
  >(portfolios: T[]): Promise<Array<T & { live_value: number }>> {
    const withValues = await withLiveValues(portfolios);
    return withValues.sort(
      (a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0)
    );
  }

  export async function getUserRankInLeague(
    leagueId: number,
    userId: string
  ): Promise<number | null> {
    const { data, error } = await supabase
      .from("Portfolios")
      .select("portfolio_id,user_id,reserve_value")
      .eq("league_id", leagueId)
      .eq("is_solo", false);

    if (error) {
      console.error("Failed to load league portfolios:", error);
      return null;
    }

    const portfolios = (data ?? []) as LeaderboardPortfolioRow[];
    if (portfolios.length === 0) return null;

    const sorted = await buildSortedLeaderboardEntries(portfolios);
    const rankIndex = sorted.findIndex((portfolio) => portfolio.user_id === userId);
    if (rankIndex < 0) return null;

    return rankIndex + 1;
  }

  export async function getUserRankInSoloLeaderboard(
    userId: string
  ): Promise<number | null> {
    const { data, error } = await supabase
      .from("Portfolios")
      .select("portfolio_id,user_id,reserve_value")
      .eq("is_solo", true)
      .is("league_id", null);

    if (error) {
      console.error("Failed to load solo portfolios:", error);
      return null;
    }

    const portfolios = (data ?? []) as LeaderboardPortfolioRow[];
    if (portfolios.length === 0) return null;

    const sorted = await buildSortedLeaderboardEntries(portfolios);
    const rankIndex = sorted.findIndex((portfolio) => portfolio.user_id === userId);
    if (rankIndex < 0) return null;

    return rankIndex + 1;
  }