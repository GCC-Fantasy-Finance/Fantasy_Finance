import { supabase } from "@/lib/supabase";

export interface PortfolioRow {
  portfolio_id: number;
  user_id: string;
  total_value: number | null;
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
  totals: { total_value: number; reserve_value: number } | null;
  holdings: HoldingView[];
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
        "portfolio_id,user_id,total_value,reserve_value,created_at,is_solo,league_id"
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

    const holdings: HoldingView[] = [];
    for (const h of (rows ?? []) as any[]) {
      const { data: stockRow, error: sErr } = await supabase
        .from("Stocks")
        .select("stock_id,stock_symbol,name,current_price")
        .eq("stock_id", h.stock_id)
        .maybeSingle();

      if (sErr) {
        holdings.push({
          portfolio_holding_id: h.portfolio_holding_id,
          portfolio_id: h.portfolio_id,
          stock_id: h.stock_id,
          quantity: h.quantity,
          average_buy_price: h.average_buy_price,
          stock: null,
        });
      } else {
        holdings.push({
          portfolio_holding_id: h.portfolio_holding_id,
          portfolio_id: h.portfolio_id,
          stock_id: h.stock_id,
          quantity: h.quantity,
          average_buy_price: h.average_buy_price,
          stock: (stockRow as StockRow) ?? null,
        });
      }
    }

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
}): Promise<PortfolioViewResult> {
  const { portfolio, error } = await fetchLatestPortfolio(params);
  if (error || !portfolio?.portfolio_id) {
    return { portfolio: null, totals: null, holdings: [] };
  }

  const totals = {
    total_value: Number(portfolio.total_value ?? 0),
    reserve_value: Number(portfolio.reserve_value ?? 0),
  };

  const { holdings } = await fetchPortfolioHoldingsWithStocks(
    portfolio.portfolio_id
  );

  return { portfolio, totals, holdings };
}
