import { supabase } from "../lib/supabase";


//get stock history for a given stock id
export async function getStockHistory(id: number) {
    const { data, error } = await supabase
        .from('Stock Histories')
        .select('*')
        .eq('stock_id', id)
        .order('timestamp_of', { ascending: false });
    if (error) {
        console.error('Error fetching stock history:', error);
        return [];
    }
    return data;
}

//get last 30 days of stock history for a given stock id
export async function getRecentStockHistory(id: number) {
    const { data, error } = await supabase
        .from('Stock Histories')
        .select('*')
        .eq('stock_id', id)
        .order('timestamp_of', { ascending: false })
        .limit(30);
    if (error) {
        console.error('Error fetching recent stock history:', error);
        return [];
    }
    return data;
}