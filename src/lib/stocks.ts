import { supabase } from "@/lib/supabase";

export type StockRow = {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  sector: string;
};


/* ================================
   Fetch Stock by ID
   ================================ */
export async function getStockById(
  stockId: number
): Promise<StockRow | null> {
  const { data, error } = await supabase
    .from("Stocks")
    .select("*")
    .eq("stock_id", stockId)
    .single();

  if (error) {
    console.error("Failed to load stock:", error);
    return null;
  }

  return data as StockRow;
}