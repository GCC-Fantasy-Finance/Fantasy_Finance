import { supabase } from "../lib/supabase";


export async function getPortfolioHistory(portfolioId: number) {
    const { data, error } = await supabase
        .from('Portfolio Histories')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('timestamp_of', { ascending: false });
    if (error) {
        console.error('Error fetching portfolio history:', error);
        return [];
    }
    return data;
}