import { getAllStocks, type StockRow } from "@/lib/stocks";

export type DiscoverStocksResult = {
  stocks: StockRow[];
};

const DISCOVER_STOCKS_CACHE_TTL_MS = 15_000;
const discoverStocksCache = {
  value: null as DiscoverStocksResult | null,
  expiresAt: 0,
};
let inFlightDiscoverStocksRequest: Promise<DiscoverStocksResult> | null = null;

export function getCachedDiscoverStocks(): DiscoverStocksResult | null {
  if (!discoverStocksCache.value) return null;
  if (Date.now() > discoverStocksCache.expiresAt) {
    discoverStocksCache.value = null;
    return null;
  }
  return discoverStocksCache.value;
}

export function invalidateCachedDiscoverStocks() {
  discoverStocksCache.value = null;
}

/**
 * Fetch all stocks for the discover page with caching.
 * Uses a singleton cache since all users see the same stock data.
 */
export async function fetchDiscoverStocks(
  options?: { useCache?: boolean; forceRefresh?: boolean }
): Promise<DiscoverStocksResult> {
  const useCache = options?.useCache !== false;
  const forceRefresh = options?.forceRefresh === true;

  if (useCache && !forceRefresh) {
    const cached = getCachedDiscoverStocks();
    if (cached) return cached;
  }

  if (inFlightDiscoverStocksRequest) return inFlightDiscoverStocksRequest;

  const request = (async () => {
    try {
      const stocks = (await getAllStocks()) as StockRow[];

      const result: DiscoverStocksResult = { stocks };
      discoverStocksCache.value = result;
      discoverStocksCache.expiresAt = Date.now() + DISCOVER_STOCKS_CACHE_TTL_MS;

      return result;
    } catch (error) {
      console.error("Failed to fetch discover stocks:", error);
      const emptyResult: DiscoverStocksResult = { stocks: [] };
      discoverStocksCache.value = emptyResult;
      discoverStocksCache.expiresAt = Date.now() + DISCOVER_STOCKS_CACHE_TTL_MS;
      return emptyResult;
    }
  })();

  inFlightDiscoverStocksRequest = request;

  try {
    return await request;
  } finally {
    inFlightDiscoverStocksRequest = null;
  }
}
