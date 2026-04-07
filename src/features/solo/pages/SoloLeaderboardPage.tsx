import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Leaderboard, {
  type LeaderboardEntry,
} from "@/layouts/components/Leaderboard";
import { useAuth } from "@/context/AuthContext";
import { buildSortedLeaderboardEntries } from "@/lib/leagues";
import { getBadgesbyUserBadges } from "@/lib/userBadges";
import TimeFrameSelector from "@/components/ui/TimeFrameSelector";

const SOLO_LEADERBOARD_CACHE_TTL_MS = 15_000;

type SoloLeaderboardCacheValue = {
  entries: LeaderboardEntry[];
  baselinesByPortfolioId: Record<
    number,
    {
      oneMonth: number;
      oneYear: number;
      allTime: number;
    }
  >;
};

type TimeFrame = "1D" | "1M" | "1Y" | "ALL" | "TOTAL";

const TIMEFRAME_OPTIONS = [
  { value: "1D", label: "1D" },
  { value: "1M", label: "1M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "ALL" },
  { value: "TOTAL", label: "TOT" },
];

type HistoryRow = {
  portfolio_id: number;
  value: number;
  timestamp_of: string;
};

function pickBaselineForCutoff(rows: HistoryRow[], cutoffMs: number): number | null {
  if (rows.length === 0) return null;

  let candidate: HistoryRow | null = null;
  for (const row of rows) {
    const rowMs = new Date(row.timestamp_of).getTime();
    if (Number.isNaN(rowMs)) continue;
    if (rowMs <= cutoffMs) {
      candidate = row;
    } else {
      break;
    }
  }

  return Number(candidate?.value ?? rows[0]?.value ?? 0);
}

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
      created_at,
      user_id,
      Profiles (
        username,
        avatar_url,
        created_at
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

  const sorted = await buildSortedLeaderboardEntries(portfolios);

  // Fetch badges for all users in the leaderboard
  const entriesWithBadges = await Promise.all(
    sorted.map(async (entry) => ({
      ...entry,
      badges: await getBadgesbyUserBadges(entry.user_id),
    }))
  );

  const portfolioIds = sorted.map((entry) => Number(entry.portfolio_id));
  const oneMonthAgoIso = new Date(
    new Date().setMonth(new Date().getMonth() - 1),
  ).toISOString();
  const oneYearAgoIso = new Date(
    new Date().setFullYear(new Date().getFullYear() - 1),
  ).toISOString();

  const [historyLastYearResult, historyAllTimeResult] = await Promise.all([
    supabase
      .from("Portfolio Histories")
      .select("portfolio_id,value,timestamp_of")
      .in("portfolio_id", portfolioIds)
      .gte("timestamp_of", oneYearAgoIso)
      .order("timestamp_of", { ascending: true }),
    supabase
      .from("Portfolio Histories")
      .select("portfolio_id,value,timestamp_of")
      .in("portfolio_id", portfolioIds)
      .order("timestamp_of", { ascending: true }),
  ]);

  const rowsLastYear = (historyLastYearResult.data ?? []) as HistoryRow[];
  const rowsAllTime = (historyAllTimeResult.data ?? []) as HistoryRow[];

  const rowsByPortfolioLastYear = new Map<number, HistoryRow[]>();
  for (const row of rowsLastYear) {
    const portfolioId = Number(row.portfolio_id);
    if (!Number.isFinite(portfolioId)) continue;
    const rows = rowsByPortfolioLastYear.get(portfolioId) ?? [];
    rows.push(row);
    rowsByPortfolioLastYear.set(portfolioId, rows);
  }

  const earliestAllTimeByPortfolio = new Map<number, number>();
  for (const row of rowsAllTime) {
    const portfolioId = Number(row.portfolio_id);
    if (!Number.isFinite(portfolioId)) continue;
    if (!earliestAllTimeByPortfolio.has(portfolioId)) {
      earliestAllTimeByPortfolio.set(portfolioId, Number(row.value ?? 0));
    }
  }

  const oneMonthCutoffMs = new Date(oneMonthAgoIso).getTime();
  const oneYearCutoffMs = new Date(oneYearAgoIso).getTime();

  const baselinesByPortfolioId: SoloLeaderboardCacheValue["baselinesByPortfolioId"] = {};

  for (const entry of sorted) {
    const portfolioId = Number(entry.portfolio_id);
    const previousClose = Number(entry.previous_close_value ?? 0);
    const historyRows = rowsByPortfolioLastYear.get(portfolioId) ?? [];

    const oneMonth =
      pickBaselineForCutoff(historyRows, oneMonthCutoffMs) ??
      earliestAllTimeByPortfolio.get(portfolioId) ??
      previousClose;

    const oneYear =
      pickBaselineForCutoff(historyRows, oneYearCutoffMs) ??
      earliestAllTimeByPortfolio.get(portfolioId) ??
      previousClose;

    const allTime =
      earliestAllTimeByPortfolio.get(portfolioId) ??
      historyRows[0]?.value ??
      previousClose;

    baselinesByPortfolioId[portfolioId] = {
      oneMonth: Number(oneMonth ?? 0),
      oneYear: Number(oneYear ?? 0),
      allTime: Number(allTime ?? 0),
    };
  }

  return {
    entries: entriesWithBadges as LeaderboardEntry[],
    baselinesByPortfolioId,
  };
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
  const [baselinesByPortfolioId, setBaselinesByPortfolioId] = useState<
    SoloLeaderboardCacheValue["baselinesByPortfolioId"]
  >({});
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("1D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSoloLeaderboard() {
      if (!profile?.id) return;

      const cached = getCachedSoloLeaderboard(Number(profile.id));
      if (cached) {
        setEntries(cached.entries);
        setBaselinesByPortfolioId(cached.baselinesByPortfolioId);
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
          setBaselinesByPortfolioId(data.baselinesByPortfolioId);
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

  const getBaselineForEntry = (
    entry: LeaderboardEntry,
    selectedTimeFrame: TimeFrame,
  ) => {
    const portfolioId = Number(entry.portfolio_id);
    const baseline = baselinesByPortfolioId[portfolioId];
    const previousClose = Number(entry.previous_close_value ?? 0);

    if (selectedTimeFrame === "1M") {
      return Number(baseline?.oneMonth ?? previousClose);
    }
    if (selectedTimeFrame === "1Y") {
      return Number(baseline?.oneYear ?? previousClose);
    }
    if (selectedTimeFrame === "ALL") {
      return Number(baseline?.allTime ?? previousClose);
    }

    return previousClose;
  };

  const sortedEntries = useMemo(() => {
    return [...entries].sort((left, right) => {
      const leftLive = Number(left.live_value ?? left.previous_close_value ?? 0);
      const rightLive = Number(right.live_value ?? right.previous_close_value ?? 0);

      if (timeFrame === "TOTAL") {
        return rightLive - leftLive;
      }

      const leftBaseline = getBaselineForEntry(left, timeFrame);
      const rightBaseline = getBaselineForEntry(right, timeFrame);

      const leftScore =
        leftBaseline > 0
          ? (leftLive - leftBaseline) / leftBaseline
          : leftLive - leftBaseline;
      const rightScore =
        rightBaseline > 0
          ? (rightLive - rightBaseline) / rightBaseline
          : rightLive - rightBaseline;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return rightLive - leftLive;
    });
  }, [entries, timeFrame, baselinesByPortfolioId]);

  const tickerPreviousValuesByPortfolioId = useMemo(() => {
    const values: Record<number, number> = {};
    for (const entry of sortedEntries) {
      values[entry.portfolio_id] = getBaselineForEntry(entry, timeFrame);
    }
    return values;
  }, [sortedEntries, timeFrame, baselinesByPortfolioId]);

  const valueColumnLabel =
    timeFrame === "TOTAL"
      ? "Portfolio Value (Total)"
      : timeFrame === "ALL"
        ? "Portfolio Value (All Time)"
        : `Portfolio Value (${timeFrame})`;

  return (
    <div className="max-w-3xl">
      {loading && <p className="text-gray-600">Loading leaderboard…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <TimeFrameSelector
            options={TIMEFRAME_OPTIONS}
            value={timeFrame}
            onChange={(value) => setTimeFrame(value as TimeFrame)}
            className="justify-start"
          />

          <Leaderboard
            entries={sortedEntries}
            currentUserId={profile?.id}
            showDateStarted
            valueColumnLabel={valueColumnLabel}
            tickerPreviousValuesByPortfolioId={tickerPreviousValuesByPortfolioId}
          />
        </>
      )}
    </div>
  );
}

export default SoloLeaderboardPage;
