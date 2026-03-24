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
  quantity: number;
  portfolioId: number;
}) {
  const { data, error } = await supabase.rpc("sell_stock_atomic", {
    p_user_id: params.userId,
    p_portfolio_id: params.portfolioId,
    p_stock_id: params.stockId,
    p_price: params.price,
    p_quantity: params.quantity,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return data;
}

export default sellStock;
