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


//get min and max of stock over last year from Stock Histories table for a given stock id
export async function getYearMinMaxStockHistory(id: number) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const { data, error } = await supabase
        .from('Stock Histories')
        .select('price, timestamp_of')
        .eq('stock_id', id)
        .gte('timestamp_of', oneYearAgo.toISOString())
        .order('timestamp_of', { ascending: false });

    if (error) {
        console.error('Error fetching one-year min/max stock history:', error);
        return { min: null, max: null };
    }

    if (!data || data.length === 0) {
        return { min: null, max: null };
    }

    const prices = data
        .map((row: any) => Number(row.price))
        .filter((price) => Number.isFinite(price));

    if (prices.length === 0) {
        return { min: null, max: null };
    }

    return {
        min: Math.min(...prices),
        max: Math.max(...prices),
    };
}

//get min and max of stock over latest trading day from Stock Intraday table for a given stock id
export async function getDayMinMaxStockHistory(id: number) {
    const now = new Date();
    const lookback = new Date();
    lookback.setDate(now.getDate() - 5);

    const { data, error } = await supabase
        .from('Stock Intraday')
        .select('price, timestamp_of')
        .eq('stock_id', id)
        .gte('timestamp_of', lookback.toISOString())
        .order('timestamp_of', { ascending: true });

    if (error) {
        console.error('Error fetching one-day min/max stock history:', error);
        return { min: null, max: null };
    }

    if (!data || data.length === 0) {
        return { min: null, max: null };
    }

    const groupedByDay: Record<string, number[]> = {};

    for (const row of data as any[]) {
        const timestamp = new Date(row.timestamp_of);
        const key = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
        const price = Number(row.price);
        if (!Number.isFinite(price)) continue;
        if (!groupedByDay[key]) groupedByDay[key] = [];
        groupedByDay[key].push(price);
    }

    const dayKeys = Object.keys(groupedByDay).sort();
    if (dayKeys.length === 0) {
        return { min: null, max: null };
    }

    const latestDayPrices = groupedByDay[dayKeys[dayKeys.length - 1]];
    if (!latestDayPrices || latestDayPrices.length === 0) {
        return { min: null, max: null };
    }

    return {
        min: Math.min(...latestDayPrices),
        max: Math.max(...latestDayPrices),
    };
}


