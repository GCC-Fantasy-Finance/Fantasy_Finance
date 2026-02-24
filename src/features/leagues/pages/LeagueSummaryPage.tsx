"use client";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getLeagueById } from "@/lib/leagues";
import { getPortfoliosByLeague } from "@/lib/portfolios";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { useAuth } from "@/context/AuthContext";
import { getPortfolioHoldings } from "@/lib/potfolioHoldings";
import { usePageTitle } from "@/hooks/usePageTitle";
import Leaderboard, { type LeaderboardEntry } from "@/layouts/components/Leaderboard";

type Profile = {
  id: string;
  username?: string;
  email?: string;
};

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

      try {
        const leagueData = await getLeagueById(parseInt(leagueId));
        setLeague(leagueData);

        const portfolios = await getPortfoliosByLeague(parseInt(leagueId));

        // Calculate final values
        const standingsData = await Promise.all(
          portfolios.map(async (portfolio) => {
            const holdings = await getPortfolioHoldings(portfolio.portfolio_id);
            const mappedHoldings = holdings.map((h: any) => ({
              quantity: h.quantity,
              stock: { current_price: h.Stocks?.current_price },
            }));
            const value = calculatePortfolioValue({
              holdings: mappedHoldings,
              reserveValue: portfolio.reserve_value,
            });
            return {
              portfolio_id: portfolio.portfolio_id,
              previous_close_value: portfolio.previous_close_value,
              live_value: value,
              user_id: portfolio.user_id,
              Profiles: portfolio.Profiles,
            } as LeaderboardEntry;
          })
        );
        setSelectedPortfolioId(standingsData[0]?.portfolio_id ?? null);

        // Sort by final value descending
        standingsData.sort((a, b) => (b.live_value ?? 0) - (a.live_value ?? 0));
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
      <Leaderboard  entries={standings} currentUserId={profile?.id} />
      <br/>
      <p className="text-sm text-gray-500 mb-2">Finished_at: {new Date(league.finish_time).toLocaleString()}</p>
    </div>
  );
}