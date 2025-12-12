import { supabase } from "@/lib/supabase";

export interface BuyResult {
  success: boolean;
  message?: string;
  portfolio_id?: number;
  portfolio_holding_id?: number;
  transaction_id?: number;
}

/**
 * Buy shares for a user: checks reserve, deducts reserve, creates holding and transaction.
 * Note: adjust table names/columns if your DB uses different identifiers (e.g., snake_case).
 */
export async function buyStock(params: {
  userId: string;
  stockId: number;
  price: number;
  quantity?: number;
  portfolioId?: number; // optional explicit target portfolio
  isSolo?: boolean; // optional filter when locating/creating portfolio
}): Promise<BuyResult> {
  const { userId, stockId, price, quantity = 1, portfolioId: inputPortfolioId, isSolo } = params;

  // 1) determine target portfolio: use provided `portfolioId` or look up by user with optional `isSolo` filter
  let existingPortfolio: { portfolio_id: number; reserve_value?: number; total_value?: number } | null = null;
  let pErr: any = null;

  if (inputPortfolioId) {
    const { data, error } = await supabase
      .from("Portfolios")
      .select("portfolio_id, reserve_value, total_value, user_id, is_solo")
      .eq("portfolio_id", inputPortfolioId)
      .maybeSingle();
    existingPortfolio = data as any;
    pErr = error;
    if (existingPortfolio && existingPortfolio.user_id !== userId) {
      return { success: false, message: "Portfolio does not belong to user" };
    }
  } else {
    let query = supabase
      .from("Portfolios")
      .select("portfolio_id, reserve_value, total_value, created_at, is_solo" as any)
      .eq("user_id", userId);

    if (typeof isSolo === "boolean") {
      query = query.eq("is_solo", isSolo);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    existingPortfolio = data as any;
    pErr = error;
  }

  if (pErr) {
    return { success: false, message: "Error fetching portfolio: " + pErr.message };
  }

  let portfolioId = existingPortfolio?.portfolio_id as number | undefined;
  let reserve = Number(existingPortfolio?.reserve_value ?? 0);

  if (!portfolioId) {
    // prepare insert payload; include `is_solo` only if specified
    const payload: Record<string, any> = { user_id: userId };
    if (typeof isSolo === "boolean") payload.is_solo = isSolo;

    const { data: newP, error: insertPError } = await supabase
      .from("Portfolios")
      .insert(payload)
      .select("portfolio_id, reserve_value, total_value")
      .maybeSingle();

    if (insertPError) {
      return { success: false, message: "Error creating portfolio: " + insertPError.message };
    }
    portfolioId = newP?.portfolio_id;
    reserve = Number(newP?.reserve_value ?? 0);
  }

  if (!portfolioId) {
    return { success: false, message: "Unable to determine portfolio id" };
  }

  const cost = Number(price) * Number(quantity);
  if (reserve < cost) {
    return { success: false, message: "Insufficient reserve value" };
  }

  // 2) deduct reserve_value (keep total_value the same per requirement)
  const newReserve = reserve - cost;
  const { data: updatedP, error: updateErr } = await supabase
    .from("Portfolios")
    .update({ reserve_value: newReserve })
    .eq("portfolio_id", portfolioId)
    .select("portfolio_id")
    .maybeSingle();

  if (updateErr) {
    return { success: false, message: "Error updating portfolio reserve: " + updateErr.message };
  }

  // 3) upsert / merge portfolio holding: if a holding exists for this portfolio+stock, update it;
  // otherwise insert a new holding. Recalculate average_buy_price when merging.
  const { data: existingHolding, error: existingHoldErr } = await supabase
    .from("Portfolio Holdings")
    .select("portfolio_holding_id,quantity,average_buy_price")
    .eq("portfolio_id", portfolioId)
    .eq("stock_id", stockId)
    .maybeSingle();

  if (existingHoldErr) {
    return { success: false, message: "Error checking existing holding: " + existingHoldErr.message };
  }

  let portfolio_holding_id: number | undefined;

  if (existingHolding) {
    const oldQty = Number(existingHolding.quantity ?? 0);
    const oldAvg = Number(existingHolding.average_buy_price ?? 0);
    const newQty = oldQty + Number(quantity);
    const newAvg = newQty > 0 ? ((oldAvg * oldQty + Number(price) * Number(quantity)) / newQty) : 0;

    const { data: updatedHolding, error: updateHoldErr } = await supabase
      .from("Portfolio Holdings")
      .update({ quantity: newQty, average_buy_price: newAvg })
      .eq("portfolio_holding_id", existingHolding.portfolio_holding_id)
      .select("portfolio_holding_id")
      .maybeSingle();

    if (updateHoldErr) {
      return { success: false, message: "Error updating existing holding: " + updateHoldErr.message };
    }

    portfolio_holding_id = updatedHolding?.portfolio_holding_id;
  } else {
    const { data: holdingRow, error: holdErr } = await supabase
      .from("Portfolio Holdings")
      .insert({
        portfolio_id: portfolioId,
        stock_id: stockId,
        quantity,
        average_buy_price: price,
      })
      .select("portfolio_holding_id")
      .maybeSingle();

    if (holdErr) {
      // attempt to rollback reserve update? For now, report error
      return { success: false, message: "Error inserting holding: " + holdErr.message };
    }

    portfolio_holding_id = holdingRow?.portfolio_holding_id;
  }

  // 4) insert a transaction record (columns may vary; adjust if necessary)
  const { data: txRow, error: txErr } = await supabase
    .from("Transactions")
    .insert({
      portfolio_id: portfolioId,
      stock_id: stockId,
      quantity,
      price,
      type: "buy",
    })
    .select("transaction_id")
    .maybeSingle();

  if (txErr) {
    return { success: false, message: "Error inserting transaction: " + txErr.message };
  }

  return {
    success: true,
    portfolio_id: portfolioId,
    portfolio_holding_id,
    transaction_id: txRow?.transaction_id,
  };
}

export default buyStock;
