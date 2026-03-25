import { supabase } from "@/lib/supabase";

export interface BuyResult {
  success: boolean;
  message?: string;
  portfolio_id?: number;
  portfolio_holding_id?: number;
  transaction_id?: number;
}

export async function buyStock(params: {
  stockId: number;
  price: number;
  quantity: number;
  portfolioId: number;
}): Promise<BuyResult> {
  const { stockId, price, quantity, portfolioId } = params;

  try {
    const { data, error } = await supabase.rpc("buy_stock", {
      p_stock_id: stockId,
      p_price: price,
      p_quantity: quantity,
      p_portfolio_id: portfolioId,
    });

    // 🔴 Postgres-level error (RAISE EXCEPTION not caught)
    if (error) {
      return {
        success: false,
        message: error.message,
      };
    }

    // 🟡 Handled error from function (returned JSON)
    if (!data?.success) {
      return {
        success: false,
        message: data?.message ?? "Purchase failed",
      };
    }

    // 🟢 Success
    return {
      success: true,
      portfolio_id: data.portfolio_id,
      portfolio_holding_id: data.portfolio_holding_id,
      transaction_id: data.transaction_id,
    };
  } catch (err: any) {
    return {
      success: false,
      message: String(err?.message ?? err),
    };
  }
}

export default buyStock;