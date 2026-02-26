"use client";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { type LeaderboardEntry } from "@/layouts/components/Leaderboard";
import { fetchLeagueView, getCachedLeagueView } from "@/hooks/fetchLeagueView";
import SummaryPageLeaderboard from "@/layouts/components/SummaryPageLeaderboard";

// type Profile = {
//   id: string;
//   username?: string;
//   email?: string;
// };

export default function LeagueSummaryPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [league, setLeague] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);

  usePageTitle(league ? `${league.name} - Results` : "League Results");

  useEffect(() => {
    const fetchSummary = async () => {
      if (!leagueId) return;

      const numericLeagueId = Number(leagueId);

      const cached = getCachedLeagueView(numericLeagueId);
      if (cached) {
        setLeague(cached.league);
        const cachedStandings = cached.leaderboard as LeaderboardEntry[];
        setStandings(cachedStandings);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const result = await fetchLeagueView(numericLeagueId, {
          useCache: true,
          forceRefresh: Boolean(cached),
        });
        setLeague(result.league);

        const standingsData = result.leaderboard as LeaderboardEntry[];
        setStandings(standingsData);
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

  return (
    <div className="p-6">
      
      

      <h2 className="text-xl font-bold mb-4 text-green-600">Winner: {standings[0]?.Profiles?.username ?? "Unknown"}</h2>
      <SummaryPageLeaderboard
        entries={standings}
        currentUserId={profile?.id}
        onPortfolioClick={(portfolioId) => setSelectedPortfolioId(portfolioId)}
      />
      <br/>
      {selectedPortfolioId ? (
        <p className="text-sm text-gray-500 mb-2">
          Selected portfolio ID: {selectedPortfolioId}
        </p>
      ) : null}
      <p className="text-sm text-gray-500 mb-2">Finished_at: {new Date(league.finish_time).toLocaleString()}</p>
    </div>
  );
}