import { supabase } from "../lib/supabase";


// get portfolio holding quantity by portfolio and stock id, if none found, return 0
export async function getPortfolioHoldingsByPortfolioIdAndStockId(portfolioId: number, stockId: number) {
  const { data, error } = await supabase
    .from("Portfolio Holdings")
    .select("quantity")
    .eq("portfolio_id", portfolioId)
    .eq("stock_id", stockId);

  if (error) {
    console.error("Error fetching portfolio holdings:", error);
    return 0;
  }

  return data.length > 0 ? data[0].quantity : 0;
}

// get all holdings for a portfolio
export async function getPortfolioHoldings(portfolioId: number) {
  const { data, error } = await supabase
    .from("Portfolio Holdings")
    .select("*")
    .eq("portfolio_id", portfolioId);
    
  if (error) {
    console.error("Error fetching portfolio holdings:", error);
    return [];
  }

  return data;
}