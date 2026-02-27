import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Leaderboard, {
  type LeaderboardEntry,
} from "@/layouts/components/Leaderboard";
import { useAuth } from "@/context/AuthContext";
import { calculatePortfolioValue } from "@/lib/portfolioValue";

const SOLO_LEADERBOARD_CACHE_TTL_MS = 15_000;

type SoloLeaderboardCacheValue = {
  entries: LeaderboardEntry[];
};

const soloLeaderboardCache = new Map<
  number,
  { value: SoloLeaderboardCacheValue; expiresAt: number }
>();
const inFlightSoloLeaderboardRequests = new Map<
  number,
  Promise<SoloLeaderboardCacheValue>
>();

function getCachedSoloLeaderboard(
  userId: number
): SoloLeaderboardCacheValue | null {
  const cached = soloLeaderboardCache.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    soloLeaderboardCache.delete(userId);
    return null;
  }
  return cached.value;
}

function setCachedSoloLeaderboard(
  userId: number,
  value: SoloLeaderboardCacheValue
) {
  soloLeaderboardCache.set(userId, {
    value,
    expiresAt: Date.now() + SOLO_LEADERBOARD_CACHE_TTL_MS,
  });
}

async function fetchSoloLeaderboardData(): Promise<SoloLeaderboardCacheValue> {
  const { data, error } = await supabase
    .from("Portfolios")
    .select(
      `
      portfolio_id,
      previous_close_value,
      reserve_value,
      user_id,
      Profiles (
        username,
        avatar_url
      )
    `,
    )
    .is("league_id", null)
    .eq("is_solo", true);

  if (error) throw error;

  const portfolios =
    (data as Array<
      LeaderboardEntry & { reserve_value?: number | null }
    >) ?? [];

  const portfolioIds = portfolios.map(
    (portfolio) => portfolio.portfolio_id,
  );

  let holdingsByPortfolio = new Map<
    number,
    Array<{
      quantity?: number | null;
      stock?: { current_price?: number | null };
    }>
  >();

  if (portfolioIds.length > 0) {
    const { data: holdingsRows } = await supabase
      .from("Portfolio Holdings")
      .select("portfolio_id, stock_id, quantity")
      .in("portfolio_id", portfolioIds);

    const stockIds = [
      ...new Set(
        (holdingsRows ?? [])
          .map((holding: any) => Number(holding.stock_id))
          .filter((stockId) => Number.isFinite(stockId)),
      ),
    ];

    const stockPricesById = new Map<number, number>();

    if (stockIds.length > 0) {
      const { data: stockRows } = await supabase
        .from("Stocks")
        .select("stock_id, current_price")
        .in("stock_id", stockIds);

      for (const stock of stockRows ?? []) {
        stockPricesById.set(
          Number((stock as any).stock_id),
          Number((stock as any).current_price ?? 0),
        );
      }
    }

    holdingsByPortfolio = (holdingsRows ?? []).reduce(
      (map, holding: any) => {
        const portfolioId = Number(holding.portfolio_id);
        const list = map.get(portfolioId) ?? [];
        list.push({
          quantity: Number(holding.quantity ?? 0),
          stock: {
            current_price:
              stockPricesById.get(Number(holding.stock_id)) ?? 0,
          },
        });
        map.set(portfolioId, list);
        return map;
      },
      new Map<
        number,
        Array<{
          quantity?: number | null;
          stock?: { current_price?: number | null };
        }>
      >(),
    );
  }

  const withLiveValues = portfolios.map((portfolio) => ({
    ...portfolio,
    live_value: calculatePortfolioValue({
      holdings: holdingsByPortfolio.get(portfolio.portfolio_id) ?? [],
      reserveValue: portfolio.reserve_value,
    }),
  }));

  const sorted = withLiveValues.sort(
    (a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0),
  );

  return { entries: sorted as LeaderboardEntry[] };
}

async function getSoloLeaderboard(
  userId: number,
  options?: { forceRefresh?: boolean }
): Promise<SoloLeaderboardCacheValue> {
  if (!options?.forceRefresh) {
    const cached = getCachedSoloLeaderboard(userId);
    if (cached) return cached;
  }

  const inFlight = inFlightSoloLeaderboardRequests.get(userId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const data = await fetchSoloLeaderboardData();
    setCachedSoloLeaderboard(userId, data);
    return data;
  })();

  inFlightSoloLeaderboardRequests.set(userId, request);

  try {
    return await request;
  } finally {
    inFlightSoloLeaderboardRequests.delete(userId);
  }
}

function SoloLeaderboardPage() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSoloLeaderboard() {
      if (!profile?.id) return;

      const cached = getCachedSoloLeaderboard(Number(profile.id));
      if (cached) {
        setEntries(cached.entries);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await getSoloLeaderboard(Number(profile.id), {
          forceRefresh: Boolean(cached),
        });
        if (mounted) {
          setEntries(data.entries);
          setError(null);
        }
      } catch (err: any) {
        console.error("Error loading solo leaderboard:", err);
        if (mounted) setError(err.message || "Failed to load leaderboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSoloLeaderboard();
    return () => {
      mounted = false;
    };
  }, [profile?.id]);

  return (
    <div className="max-w-3xl">
      {loading && <p className="text-gray-600">Loading leaderboard…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <Leaderboard entries={entries} currentUserId={profile?.id} />
      )}
    </div>
  );
}

export default SoloLeaderboardPage;
