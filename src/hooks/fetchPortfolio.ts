import { supabase } from "@/lib/supabase";

export interface PortfolioRow {
  portfolio_id: number;
  user_id: string;
  previous_close_value: number | null;
  reserve_value: number | null;
  created_at?: string | null;
  is_solo?: boolean | null;
  league_id?: number | null;
}

export interface HoldingRow {
  portfolio_holding_id: number;
  portfolio_id: number;
  stock_id: number;
  quantity: number;
  average_buy_price: number | null;
}

export interface StockRow {
  stock_id: number;
  stock_symbol: string | null;
  name: string | null;
  current_price: number | null;
}

export interface HoldingView {
  portfolio_holding_id: number;
  portfolio_id: number;
  stock_id: number;
  quantity: number;
  average_buy_price: number | null;
  stock?: StockRow | null;
}

export interface PortfolioViewResult {
  portfolio: PortfolioRow | null;
  totals: { previous_close_value: number; reserve_value: number } | null;
  holdings: HoldingView[];
}

type PortfolioViewParams = {
  userId: string;
  isSolo?: boolean;
  leagueId?: number;
};

const PORTFOLIO_VIEW_CACHE_TTL_MS = 15_000;
const portfolioViewCache = new Map<
  string,
  { value: PortfolioViewResult; expiresAt: number }
>();
const inFlightPortfolioViewRequests = new Map<string, Promise<PortfolioViewResult>>();

function makePortfolioViewCacheKey(params: PortfolioViewParams) {
  const { userId, isSolo, leagueId } = params;
  return `${userId}|${typeof isSolo === "boolean" ? String(isSolo) : "any"}|${typeof leagueId === "number" ? String(leagueId) : "any"}`;
}

export function getCachedPortfolioView(
  params: PortfolioViewParams
): PortfolioViewResult | null {
  const key = makePortfolioViewCacheKey(params);
  const cached = portfolioViewCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    portfolioViewCache.delete(key);
    return null;
  }
  return cached.value;
}

export function invalidateCachedPortfolioView(params?: PortfolioViewParams) {
  if (!params) {
    portfolioViewCache.clear();
    return;
  }
  portfolioViewCache.delete(makePortfolioViewCacheKey(params));
}

/**
 * Fetch the latest portfolio for a user with optional filters.
 * Pass { isSolo: true } for Solo; pass { leagueId } for a specific league portfolio.
 * If both are omitted, returns the latest by created_at for the user.
 */
export async function fetchLatestPortfolio(params: {
  userId: string;
  isSolo?: boolean;
  leagueId?: number;
}): Promise<{ portfolio: PortfolioRow | null; error?: string }> {
  const { userId, isSolo, leagueId } = params;

  try {
    let query = supabase
      .from("Portfolios")
      .select(
        "portfolio_id,user_id,previous_close_value,reserve_value,created_at,is_solo,league_id"
      )
      .eq("user_id", userId);

    if (typeof isSolo === "boolean") {
      query = query.eq("is_solo", isSolo);
    }
    if (typeof leagueId === "number") {
      query = query.eq("league_id", leagueId);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { portfolio: null, error: error.message };

    // Defensive: ensure it still matches filters
    if (
      data &&
      (data.user_id !== userId ||
        (typeof isSolo === "boolean" && data.is_solo !== isSolo) ||
        (typeof leagueId === "number" && data.league_id !== leagueId))
    ) {
      return { portfolio: null, error: "Portfolio filters mismatch" };
    }

    return { portfolio: (data as PortfolioRow) ?? null };
  } catch (err: any) {
    return { portfolio: null, error: String(err?.message ?? err) };
  }
}

/**
 * Fetch holdings for a given portfolio, and join each with its Stock info.
 * Simple approach with N+1 queries; can be optimized later.
 */
export async function fetchPortfolioHoldingsWithStocks(
  portfolioId: number
): Promise<{ holdings: HoldingView[]; error?: string }> {
  try {
    const { data: rows, error } = await supabase
      .from("Portfolio Holdings")
      .select(
        "portfolio_holding_id,portfolio_id,stock_id,quantity,average_buy_price"
      )
      .eq("portfolio_id", portfolioId);

    if (error) return { holdings: [], error: error.message };

    const baseRows = (rows ?? []) as any[];
    const stockIds = Array.from(
      new Set(
        baseRows
          .map((row) => Number(row.stock_id))
          .filter((stockId) => Number.isFinite(stockId))
      )
    );

    const stockById = new Map<number, StockRow>();
    if (stockIds.length > 0) {
      const { data: stockRows, error: stockError } = await supabase
        .from("Stocks")
        .select("stock_id,stock_symbol,name,current_price")
        .in("stock_id", stockIds);

      if (stockError) {
        return { holdings: [], error: stockError.message };
      }

      for (const stock of (stockRows ?? []) as any[]) {
        stockById.set(Number(stock.stock_id), stock as StockRow);
      }
    }

    const holdings: HoldingView[] = baseRows.map((row) => ({
      portfolio_holding_id: row.portfolio_holding_id,
      portfolio_id: row.portfolio_id,
      stock_id: row.stock_id,
      quantity: row.quantity,
      average_buy_price: row.average_buy_price,
      stock: stockById.get(Number(row.stock_id)) ?? null,
    }));

    return { holdings };
  } catch (err: any) {
    return { holdings: [], error: String(err?.message ?? err) };
  }
}

/**
 * Convenience: fetch a full portfolio view (portfolio row + totals + holdings with stocks).
 */
export async function fetchPortfolioView(params: {
  userId: string;
  isSolo?: boolean;
  leagueId?: number;
}, options?: { useCache?: boolean; forceRefresh?: boolean }): Promise<PortfolioViewResult> {
  const key = makePortfolioViewCacheKey(params);
  const useCache = options?.useCache !== false;
  const forceRefresh = options?.forceRefresh === true;

  if (useCache && !forceRefresh) {
    const cached = getCachedPortfolioView(params);
    if (cached) return cached;
  }

  const inFlight = inFlightPortfolioViewRequests.get(key);
  if (inFlight) return inFlight;

  const request = (async () => {
    const { portfolio, error } = await fetchLatestPortfolio(params);
    if (error || !portfolio?.portfolio_id) {
      const emptyResult = { portfolio: null, totals: null, holdings: [] };
      portfolioViewCache.set(key, {
        value: emptyResult,
        expiresAt: Date.now() + PORTFOLIO_VIEW_CACHE_TTL_MS,
      });
      return emptyResult;
    }

    const totals = {
      previous_close_value: Number(portfolio.previous_close_value ?? 0),
      reserve_value: Number(portfolio.reserve_value ?? 0),
    };

    const { holdings } = await fetchPortfolioHoldingsWithStocks(
      portfolio.portfolio_id
    );

    const result = { portfolio, totals, holdings };
    portfolioViewCache.set(key, {
      value: result,
      expiresAt: Date.now() + PORTFOLIO_VIEW_CACHE_TTL_MS,
    });

    return result;
  })();

  inFlightPortfolioViewRequests.set(key, request);

  try {
    return await request;
  } finally {
    inFlightPortfolioViewRequests.delete(key);
  }
}
