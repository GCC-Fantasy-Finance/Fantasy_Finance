import { supabase } from "../lib/supabase";

// get all stocks
export async function getAllStocks() {
    const { data, error } = await supabase
        .from("Stocks")
        .select("*")
        .order("stock_symbol");
    if (error) {
        console.error(error);
        return [];
    }
    return data;
}