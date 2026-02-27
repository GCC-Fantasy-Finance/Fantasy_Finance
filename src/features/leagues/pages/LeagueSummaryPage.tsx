"use client";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { type LeaderboardEntry } from "@/layouts/components/Leaderboard";
import SummaryPageLeaderboard from "@/layouts/components/SummaryPageLeaderboard";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import LeaguePortfolioChart from "@/components/ui/leaguePortfolioChart";
import LeagueMemberPortfolioModal from "@/components/ui/LeagueMemberPortfolioModal";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { getLeagueById } from "@/lib/leagues";
import { getPortfoliosByLeague } from "@/lib/portfolios";
import { getLatestPortfolioHistoryValues } from "@/lib/portfolioHistory";


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
  leagueId: number
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
  value: LeagueSummaryCacheValue
) {
  leagueSummaryCache.set(leagueId, {
    value,
    expiresAt: Date.now() + LEAGUE_SUMMARY_CACHE_TTL_MS,
  });
}

async function fetchLeagueSummaryData(
  leagueId: number
): Promise<LeagueSummaryCacheValue> {
  const leagueData = await getLeagueById(leagueId);
  const portfolios = (await getPortfoliosByLeague(leagueId)) as LeaderboardEntry[];

  const portfolioIds = portfolios
    .map((entry) => Number(entry.portfolio_id))
    .filter((portfolioId) => Number.isFinite(portfolioId));

  if (portfolioIds.length === 0) {
    return { league: leagueData, standings: portfolios };
  }

  const latestValueByPortfolio = await getLatestPortfolioHistoryValues(
    portfolioIds
  );

  if (latestValueByPortfolio.size === 0) {
    const fallbackStandings = portfolios
      .map((entry) => ({
        ...entry,
        live_value: entry.previous_close_value,
      }))
      .sort((a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0));

    return { league: leagueData, standings: fallbackStandings };
  }

  const standings = portfolios
    .map((entry) => ({
      ...entry,
      live_value:
        latestValueByPortfolio.get(Number(entry.portfolio_id)) ??
        entry.previous_close_value,
    }))
    .sort((a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0));

  return { league: leagueData, standings };
}

async function getLeagueSummary(
  leagueId: number,
  options?: { forceRefresh?: boolean }
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
  const [league, setLeague] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  
  usePageTitle(league ? `${league.name} - Results` : "League Results");

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

  if (loading) return <p>Loading league summary...</p>;
  if (!league) return <p>League not found.</p>;

  const chartPortfolios = standings.map((entry) => ({
    portfolio_id: Number(entry.portfolio_id),
    username: entry.Profiles?.username ?? `Portfolio ${entry.portfolio_id}`,
  }));

  const currentUserPortfolioId = standings.find(
    (entry) => entry.user_id === profile?.id
  )?.portfolio_id;

  const selectedEntry = standings.find(
    (entry) => entry.portfolio_id === selectedPortfolioId
  );

  return (
    <div className="p-6">
      
      <div className="mb-6 w-full flex justify-center">
      {standings[0]?.portfolio_id === currentUserPortfolioId ? (
        <h2 className="bg-green-100 text-xl font-bold mb-4 text-green-600 text-center border border-green-600 rounded px-4 py-2">Congratulations, you won the league!</h2>
      ) : (
        <h2 className="bg-red-100 text-xl font-bold mb-4 text-red-600 text-center border border-red-600 rounded px-4 py-2">Better luck next time!</h2>
      )}
      </div>
      
      <div className="w-full flex gap-8">
        <div className="flex-1">
          <SummaryPageLeaderboard
            entries={standings}
            currentUserId={profile?.id}
            onPortfolioClick={(portfolioId) => setSelectedPortfolioId(portfolioId)}
          />
        </div>
        <div className="flex-1 w-full">
          <LeaguePortfolioChart portfolios={chartPortfolios} currentUserPortfolioId={Number(currentUserPortfolioId)} />
        </div>
      </div>

      <LeagueMemberPortfolioModal
        open={selectedPortfolioId != null}
        portfolioId={selectedPortfolioId}
        memberName={selectedEntry?.Profiles?.username ?? "Unknown User"}
        memberAvatarUrl={selectedEntry?.Profiles?.avatar_url}
        fallbackNetValue={
          selectedEntry
            ? calculatePortfolioValue({
                netValue:
                  selectedEntry.live_value ?? selectedEntry.previous_close_value,
              })
            : undefined
        }
        onClose={() => setSelectedPortfolioId(null)}
      />

      <br/>
      {/* {selectedPortfolioId ? (
        <p className="text-sm text-gray-500 mb-2">
          Selected portfolio ID: {selectedPortfolioId}
        </p>
      ) : null} */}
      <p className="text-sm text-gray-500 mb-2">Finished_at: {new Date(league.finish_time).toLocaleString()}</p>

      <Button
        variant="outline"
        className="mt-3 text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => {
          if (window.confirm("Are you sure you want to leave this league?")) {
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
                    })
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
  );
}