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

export async function getLatestPortfolioHistoryValues(
    portfolioIds: number[]
): Promise<Map<number, number>> {
    const validPortfolioIds = portfolioIds.filter((portfolioId) =>
        Number.isFinite(portfolioId)
    );

    if (validPortfolioIds.length === 0) {
        return new Map<number, number>();
    }

    const { data: historyRows, error } = await supabase
        .from("Portfolio Histories")
        .select("portfolio_id,value,timestamp_of")
        .in("portfolio_id", validPortfolioIds)
        .order("timestamp_of", { ascending: false });

    if (error || !historyRows) {
        return new Map<number, number>();
    }

    const latestValueByPortfolio = new Map<number, number>();
    for (const row of historyRows as any[]) {
        const portfolioId = Number(row.portfolio_id);
        if (!Number.isFinite(portfolioId)) continue;
        if (!latestValueByPortfolio.has(portfolioId)) {
            latestValueByPortfolio.set(portfolioId, Number(row.value ?? 0));
        }
    }

    return latestValueByPortfolio;
}