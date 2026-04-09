"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { type LeaderboardEntry } from "@/layouts/components/Leaderboard";
import SummaryPageLeaderboard from "@/layouts/components/SummaryPageLeaderboard";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import LeaguePortfolioChart from "@/components/ui/leaguePortfolioChart";
import MemberPortfolioModal from "@/components/ui/LeagueMemberPortfolioModal";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { getLeagueById } from "@/lib/leagues";
import { getPortfoliosByLeague } from "@/lib/portfolios";
import { getLatestPortfolioHistoryValues } from "@/lib/portfolioHistory";
import { getBadgesbyUserBadges } from "@/lib/userBadges";
import { getDraftPicksByLeague } from "@/lib/draftpicks";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import { getStockById, type StockRow } from "@/lib/stocks";
import { toast } from "sonner";
import Spinner from "@/components/ui/spinner";

import { getCachedLeagueView } from "@/hooks/fetchLeagueView";

const LEAGUE_SUMMARY_CACHE_TTL_MS = 15_000;

type LeagueSummaryCacheValue = {
  league: any;
  standings: LeaderboardEntry[];
};

const leagueSummaryCache = new Map<
  number,
  { value: LeagueSummaryCacheValue; expiresAt: number }
>();
const inFlightLeagueSummaryRequests = new Map<
  number,
  Promise<LeagueSummaryCacheValue>
>();

function getCachedLeagueSummary(
  leagueId: number,
): LeagueSummaryCacheValue | null {
  const cached = leagueSummaryCache.get(leagueId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    leagueSummaryCache.delete(leagueId);
    return null;
  }
  return cached.value;
}

function setCachedLeagueSummary(
  leagueId: number,
  value: LeagueSummaryCacheValue,
) {
  leagueSummaryCache.set(leagueId, {
    value,
    expiresAt: Date.now() + LEAGUE_SUMMARY_CACHE_TTL_MS,
  });
}

async function fetchLeagueSummaryData(
  leagueId: number,
): Promise<LeagueSummaryCacheValue> {
  const leagueData = await getLeagueById(leagueId);
  const portfolios = (await getPortfoliosByLeague(
    leagueId,
  )) as LeaderboardEntry[];

  const portfolioIds = portfolios
    .map((entry) => Number(entry.portfolio_id))
    .filter((portfolioId) => Number.isFinite(portfolioId));

  if (portfolioIds.length === 0) {
    return { league: leagueData, standings: portfolios };
  }

  const latestValueByPortfolio =
    await getLatestPortfolioHistoryValues(portfolioIds);

  if (latestValueByPortfolio.size === 0) {
    const sortedPortfolios = portfolios
      .map((entry) => ({
        ...entry,
        live_value: entry.previous_close_value,
      }))
      .sort((a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0));

    const fallbackStandings = await Promise.all(
      sortedPortfolios.map(async (entry) => ({
        ...entry,
        badges: await getBadgesbyUserBadges(entry.user_id),
      })),
    );

    return { league: leagueData, standings: fallbackStandings };
  }

  const sortedPortfolios = portfolios
    .map((entry) => ({
      ...entry,
      live_value:
        latestValueByPortfolio.get(Number(entry.portfolio_id)) ??
        entry.previous_close_value,
    }))
    .sort((a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0));

  const standings = await Promise.all(
    sortedPortfolios.map(async (entry) => ({
      ...entry,
      badges: await getBadgesbyUserBadges(entry.user_id),
    })),
  );

  return { league: leagueData, standings };
}

async function getLeagueSummary(
  leagueId: number,
  options?: { forceRefresh?: boolean },
): Promise<LeagueSummaryCacheValue> {
  if (!options?.forceRefresh) {
    const cached = getCachedLeagueSummary(leagueId);
    if (cached) return cached;
  }

  const inFlight = inFlightLeagueSummaryRequests.get(leagueId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const data = await fetchLeagueSummaryData(leagueId);
    setCachedLeagueSummary(leagueId, data);
    return data;
  })();

  inFlightLeagueSummaryRequests.set(leagueId, request);

  try {
    return await request;
  } finally {
    inFlightLeagueSummaryRequests.delete(leagueId);
  }
}

export default function LeagueSummaryPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const numericLeagueId = Number(leagueId);
  const cachedLeagueName = Number.isFinite(numericLeagueId)
    ? (getCachedLeagueSummary(numericLeagueId)?.league?.name ??
      getCachedLeagueView(numericLeagueId)?.league?.name)
    : undefined;
  const [league, setLeague] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [hasSeenModal, setHasSeenModal] = useState(false);
  const [draftedStocks, setDraftedStocks] = useState<
    { stockId: number; label: string }[]
  >([]);
  const [stockDetailsModalOpen, setStockDetailsModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);
  const { profile } = useAuth();

  usePageTitle(
    league?.name
      ? `${league.name} - Results`
      : cachedLeagueName
        ? `${cachedLeagueName} - Results`
        : undefined,
  );

  const handleCloseModal = () => {
    // Save to localStorage so modal doesn't show again for this league
    const hasSeenKey = `league_${leagueId}_seen_modal`;
    localStorage.setItem(hasSeenKey, "true");
    setShowResultsModal(false);
    setHasSeenModal(true);
  };

  const handleOpenStockDetails = async (stockId?: number) => {
    if (!stockId) return;

    setStockDetailsModalOpen(true);

    try {
      const stock = await getStockById(stockId);
      setSelectedStock(stock);
    } catch {
      toast.error("Failed to load stock details");
      setStockDetailsModalOpen(false);
    }
  };

  useEffect(() => {
    // Prevent body scroll when stock details modal is open
    if (stockDetailsModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [stockDetailsModalOpen]);

  useEffect(() => {
    // Check if user has already seen modal for this league
    if (leagueId && !hasSeenModal && !loading) {
      const hasSeenKey = `league_${leagueId}_seen_modal`;
      if (!localStorage.getItem(hasSeenKey)) {
        setShowResultsModal(true);
      }
    }
  }, [leagueId, hasSeenModal, loading]);

  useEffect(() => {
    const fetchSummary = async () => {
      if (!leagueId) return;

      const numericLeagueId = Number(leagueId);

      const cached = getCachedLeagueSummary(numericLeagueId);
      if (cached) {
        setLeague(cached.league);
        setStandings(cached.standings);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await getLeagueSummary(numericLeagueId, {
          forceRefresh: Boolean(cached),
        });
        setLeague(data.league);
        setStandings(data.standings);
      } catch (err) {
        console.error("Failed to fetch league summary:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [leagueId]);

  useEffect(() => {
    const loadDraftedStocks = async () => {
      if (!standings.length || !profile?.id) return;

      try {
        const currentUserPortfolio = standings.find(
          (entry) => entry.user_id === profile?.id,
        );
        if (!currentUserPortfolio) return;

        const leagueIdAsNumber = Number(leagueId);

        // Check if drafting is enabled
        const leagueData = await getLeagueById(leagueIdAsNumber);
        const draftingEnabled = Boolean(leagueData?.has_drafting);
        if (!draftingEnabled) {
          setDraftedStocks([]);
          return;
        }

        // Get all draft picks for this league
        const picks = await getDraftPicksByLeague(leagueIdAsNumber);
        const myPickStockIds = picks
          .filter(
            (pick) => pick.portfolio_id === currentUserPortfolio.portfolio_id,
          )
          .map((pick) => Number(pick.stock_id));

        const uniqueStockIds = Array.from(
          new Set(myPickStockIds.filter((stockId) => Number.isFinite(stockId))),
        );

        if (uniqueStockIds.length === 0) {
          setDraftedStocks([]);
          return;
        }

        // Fetch stock data from database
        const { data: stockRows, error } = await supabase
          .from("Stocks")
          .select("stock_id,name,stock_symbol")
          .in("stock_id", uniqueStockIds);

        if (error) {
          console.error("Failed to load drafted stock names:", error);
          setDraftedStocks([]);
          return;
        }

        // Map stock IDs to their labels
        const stockNameById = new Map<number, string>();
        for (const stockRow of stockRows ?? []) {
          const stockId = Number((stockRow as { stock_id: number }).stock_id);
          const stockName =
            (stockRow as { name?: string | null }).name?.trim() ||
            `Stock #${stockId}`;
          const stockSymbol =
            (
              stockRow as { stock_symbol?: string | null }
            ).stock_symbol?.trim() || "";

          stockNameById.set(
            stockId,
            stockSymbol ? `${stockSymbol} - ${stockName}` : stockName,
          );
        }

        // Create ordered list of drafted stocks
        const seenStockIds = new Set<number>();
        const orderedDraftedStocks: { stockId: number; label: string }[] = [];
        for (const stockId of myPickStockIds) {
          if (seenStockIds.has(stockId)) continue;
          seenStockIds.add(stockId);
          orderedDraftedStocks.push({
            stockId,
            label: stockNameById.get(stockId) ?? `Stock #${stockId}`,
          });
        }

        setDraftedStocks(orderedDraftedStocks);
      } catch (err) {
        console.error("Failed to load drafted stocks:", err);
        setDraftedStocks([]);
      }
    };

    loadDraftedStocks();
  }, [leagueId, standings, profile?.id]);

  // Calculate values BEFORE early returns to maintain hook order
  const chartPortfolios = useMemo(
    () =>
      standings.map((entry) => ({
        portfolio_id: Number(entry.portfolio_id),
        username: entry.Profiles?.username ?? `Portfolio ${entry.portfolio_id}`,
      })),
    [standings],
  );

  const currentUserPortfolioId = standings.find(
    (entry) => entry.user_id === profile?.id,
  )?.portfolio_id;

  const hasWon = standings[0]?.portfolio_id === currentUserPortfolioId;

  const leaderboardData = useMemo(
    () =>
      standings.map((entry) => ({
        portfolio_id: Number(entry.portfolio_id),
        username: entry.Profiles?.username ?? `Portfolio ${entry.portfolio_id}`,
        live_value: entry.live_value ?? entry.previous_close_value ?? 0,
      })),
    [standings],
  );

  if (loading)
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Spinner />
      </div>
    );
  if (!league) return <p>League not found.</p>;

  const selectedEntry = standings.find(
    (entry) => entry.portfolio_id === selectedPortfolioId,
  );

  return (
    <div className="w-full relative">
      {/* Results Modal */}
      {showResultsModal && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-start pt-24 pointer-events-none animate-in fade-in-0 duration-300">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-white/50 backdrop-blur-xs pointer-events-auto animate-in fade-in-0 duration-300"
            onClick={handleCloseModal}
          />

          {/* Modal Container */}
          <div className="relative z-10 max-w-md w-full mx-4 pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-300">
            {/* Modal */}
            <div className="rounded-lg p-8 shadow-lg bg-white border border-green-700">
              {/* Logo */}
              <div className="flex justify-center mb-6">
                <img
                  src="/ff_favicon.png"
                  alt="Fantasy Finance"
                  className="w-12 h-12 object-contain"
                />
              </div>

              {/* Header */}
              <div className="text-center mb-8">
                <p className="text-lg font-semibold text-gray-700">
                  The {league?.name} league has ended
                </p>
              </div>

              {/* Footer with CTA */}
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModal}
                >
                  View Final Results <span className="text-lg">→</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-full px-2 md:px-4 lg:px-6 py-4 md:py-6">
        {/* Results Banner */}
        <div
          className={`mb-6 flex flex-col justify-center items-center transition-opacity duration-500 ${showResultsModal ? "opacity-100" : "opacity-100"}`}
        >
          {hasWon && (
            <img
              src="/crown.png"
              alt="Winner crown"
              className="w-12 h-12 object-contain mb-3"
            />
          )}
          {standings[0]?.portfolio_id === currentUserPortfolioId ? (
            <div className="w-full rounded-lg p-8 bg-green-50 border border-green-600 max-w-md">
              <p className="text-sm font-medium text-green-700 text-center mb-4">
                The {league?.name} league has ended
              </p>
              <h2 className="text-2xl font-bold text-green-700 text-center">
                You are the champion!
              </h2>
            </div>
          ) : (
            <div className="w-full rounded-lg p-8 bg-red-50 border border-red-600 max-w-md">
              <p className="text-sm font-medium text-red-700 text-center mb-4">
                The {league?.name} league has ended
              </p>
              <h2 className="text-2xl font-bold text-red-700 text-center">
                Better luck next time!
              </h2>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div
          className={`mb-18 transition-opacity duration-500 ${showResultsModal ? "opacity-100" : "opacity-100"}`}
        >
          {/* Leaderboard and Graph - Two Column Grid */}
          <div className="mb-6 grid grid-cols-1 gap-6 min-[1200px]:grid-cols-2">
            {/* Leaderboard Column */}
            <div className="w-full rounded-md border border-gray-300 bg-white">
              <div className="px-6 py-5">
                <SummaryPageLeaderboard
                  entries={standings}
                  currentUserId={profile?.id}
                  onPortfolioClick={(portfolioId) =>
                    setSelectedPortfolioId(portfolioId)
                  }
                />
              </div>
            </div>

            {/* Graph Column */}
            <div className="w-full">
              <LeaguePortfolioChart
                portfolios={chartPortfolios}
                currentUserPortfolioId={Number(currentUserPortfolioId)}
                leaderboard={leaderboardData}
                endDate={
                  league?.finish_time
                    ? new Date(league.finish_time).toISOString().split("T")[0]
                    : undefined
                }
              />
            </div>
          </div>

          {/* Drafted Stocks Section */}
          {draftedStocks.length > 0 && (
            <div className="mb-6 rounded-lg border border-gray-300 bg-white px-4 py-3">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">
                Your Drafted Stocks
              </h2>
              <div className="flex flex-wrap gap-2">
                {draftedStocks.map((stock) => (
                  <button
                    key={stock.stockId}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenStockDetails(stock.stockId);
                    }}
                    className="inline-flex cursor-pointer items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    {stock.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500">
                Finished at: {new Date(league.finish_time).toLocaleString()}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-fit text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to leave this league?",
                    )
                  ) {
                    supabase
                      .from("Portfolios")
                      .delete()
                      .eq("league_id", leagueId)
                      .eq("user_id", profile?.id)
                      .then(({ error }) => {
                        if (error) {
                          alert("Failed to leave league: " + error.message);
                        } else {
                          leagueSummaryCache.delete(Number(leagueId));
                          window.dispatchEvent(
                            new CustomEvent("ff:leagues-updated", {
                              detail: { leagueId: Number(leagueId) },
                            }),
                          );
                          navigate("/");
                        }
                      });
                  }
                }}
              >
                Leave League
              </Button>
            </div>
          </div>
        </div>

        <MemberPortfolioModal
          open={selectedPortfolioId != null}
          portfolioId={selectedPortfolioId}
          memberName={selectedEntry?.Profiles?.username ?? "Unknown User"}
          memberAvatarUrl={selectedEntry?.Profiles?.avatar_url}
          memberUserId={
            selectedEntry
              ? (console.log(
                  "DEBUG LeagueSummaryPage selectedEntry:",
                  selectedEntry,
                ),
                selectedEntry.user_id)
              : undefined
          }
          leagueOwnerId={league?.owner_id}
          isLeagueOwner={profile?.id === league?.owner_id}
          badges={selectedEntry?.badges}
          joinedDate={selectedEntry?.Profiles?.created_at}
          leagueFinished
          leagueId={Number(leagueId)}
          fallbackNetValue={
            selectedEntry
              ? calculatePortfolioValue({
                  netValue:
                    selectedEntry.live_value ??
                    selectedEntry.previous_close_value,
                })
              : undefined
          }
          onClose={() => setSelectedPortfolioId(null)}
        />

        <StockDetailsModal
          open={stockDetailsModalOpen}
          stock={selectedStock}
          onClose={() => setStockDetailsModalOpen(false)}
        />
      </div>
    </div>
  );
}
