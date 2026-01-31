import { supabase } from "@/lib/supabase";

export interface SellResult {
  success: boolean;
  message?: string;
  portfolio_id?: number;
  portfolio_holding_id?: number | null;
  transaction_id?: number;
}

/**
 * Sell shares for a user: checks holding quantity, increments reserve, updates/removes holding, and creates transaction.
 * Mirrors `buyStock` params to keep API consistent.
 */
export async function sellStock(params: {
  userId: string;
  stockId: number;
  price: number;
  quantity?: number; // defaults to 1
  portfolioId?: number; // optional explicit target portfolio
  isSolo?: boolean; // optional filter when locating portfolio
}): Promise<SellResult> {
  const { userId, stockId, price, quantity = 1, portfolioId: inputPortfolioId, isSolo } = params;

  // 1) Locate target portfolio (do NOT auto-create on sell)
  let portfolio: { portfolio_id: number; reserve_value?: number; user_id: string } | null = null;
  let pErr: any = null;

  if (inputPortfolioId) {
    const { data, error } = await supabase
      .from("Portfolios")
      .select("portfolio_id, reserve_value, user_id, is_solo")
      .eq("portfolio_id", inputPortfolioId)
      .maybeSingle();
    portfolio = data as any;
    pErr = error;
    if (portfolio && portfolio.user_id !== userId) {
      return { success: false, message: "Portfolio does not belong to user" };
    }
  } else {
    let query = supabase
      .from("Portfolios")
      .select("portfolio_id, reserve_value, created_at, is_solo" as any)
      .eq("user_id", userId);

    if (typeof isSolo === "boolean") {
      query = query.eq("is_solo", isSolo);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    portfolio = data as any;
    pErr = error;
  }

  if (pErr) {
    return { success: false, message: "Error fetching portfolio: " + pErr.message };
  }
  if (!portfolio) {
    return { success: false, message: "No portfolio found to sell from" };
  }

  const portfolioId = portfolio.portfolio_id;

  // 2) Ensure holding exists and has enough quantity
  const { data: existingHolding, error: holdingErr } = await supabase
    .from("Portfolio Holdings")
    .select("portfolio_holding_id, quantity, average_buy_price")
    .eq("portfolio_id", portfolioId)
    .eq("stock_id", stockId)
    .maybeSingle();

  if (holdingErr) {
    return { success: false, message: "Error checking existing holding: " + holdingErr.message };
  }
  if (!existingHolding) {
    return { success: false, message: "No holding found for this stock" };
  }

  const oldQty = Number(existingHolding.quantity ?? 0);
  const sellQty = Number(quantity);
  if (sellQty <= 0) {
    return { success: false, message: "Sell quantity must be positive" };
  }
  if (oldQty < sellQty) {
    return { success: false, message: "Insufficient shares to sell" };
  }

  // 3) Increase reserve by proceeds (keep total_value unchanged per current app behavior)
  const currentReserve = Number(portfolio.reserve_value ?? 0);
  const proceeds = Number(price) * sellQty;
  const newReserve = currentReserve + proceeds;

  const { error: updatePortErr } = await supabase
    .from("Portfolios")
    .update({ reserve_value: newReserve })
    .eq("portfolio_id", portfolioId);

  if (updatePortErr) {
    return { success: false, message: "Error updating portfolio reserve: " + updatePortErr.message };
  }

  // 4) Update or remove holding
  const newQty = oldQty - sellQty;
  let resultingHoldingId: number | null = existingHolding.portfolio_holding_id ?? null;

  if (newQty > 0) {
    const { data: updatedHolding, error: updateHoldErr } = await supabase
      .from("Portfolio Holdings")
      .update({ quantity: newQty }) // average_buy_price remains as historical metric
      .eq("portfolio_holding_id", existingHolding.portfolio_holding_id)
      .select("portfolio_holding_id")
      .maybeSingle();

    if (updateHoldErr) {
      return { success: false, message: "Error updating holding: " + updateHoldErr.message };
    }
    resultingHoldingId = updatedHolding?.portfolio_holding_id ?? resultingHoldingId;
  } else {
    // If selling all remaining shares, remove the holding record entirely.
    // Use a robust match (portfolio_id + stock_id) to avoid stale ID issues.
    const { error: deleteErr } = await supabase
      .from("Portfolio Holdings")
      .delete()
      .eq("portfolio_id", portfolioId)
      .eq("stock_id", stockId);

    if (deleteErr) {
      return { success: false, message: "Error removing holding: " + deleteErr.message };
    }
    resultingHoldingId = null;
  }

  // 5) Insert a transaction record
  const { data: txRow, error: txErr } = await supabase
    .from("Transactions")
    .insert({
      portfolio_id: portfolioId,
      stock_id: stockId,
      quantity: sellQty,
      price_per_share: price,
      transaction_type: "sell",
      transaction_total: sellQty * price,
    })
    .select("transaction_id")
    .maybeSingle();

  if (txErr) {
    return { success: false, message: "Error inserting transaction: " + txErr.message };
  }

  return {
    success: true,
    portfolio_id: portfolioId,
    portfolio_holding_id: resultingHoldingId,
    transaction_id: txRow?.transaction_id,
  };
}

export default sellStock;
