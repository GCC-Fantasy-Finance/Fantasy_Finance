import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PortfolioPage from "@/features/portfolio/pages/PortfolioPage";
import { usePageTitle } from "@/hooks/usePageTitle";
import { fetchLeagueView, getCachedLeagueView } from "@/hooks/fetchLeagueView";
import { type LeagueRow } from "@/lib/leagues";

export default function LeaguePortfolioPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const numericLeagueId = Number(leagueId);
  const cachedLeagueName = Number.isFinite(numericLeagueId)
    ? getCachedLeagueView(numericLeagueId)?.league?.name
    : undefined;
  const [league, setLeague] = useState<LeagueRow | null>(null);

  usePageTitle(league?.name ?? cachedLeagueName);

  useEffect(() => {
    let mounted = true;

    async function loadLeague() {
      const numericLeagueId = Number(leagueId);

      if (!leagueId || !Number.isFinite(numericLeagueId)) {
        setLeague(null);
        return;
      }

      try {
        // Use fetchLeagueView to get cached league data
        const leagueViewResult = await fetchLeagueView(numericLeagueId);
        if (!mounted) return;
        
        // We just need the league info from the result
        if (leagueViewResult.league) {
          setLeague(leagueViewResult.league as LeagueRow);
        }
      } catch (error) {
        console.error("Failed to load league:", error);
        if (mounted) {
          setLeague(null);
        }
      }
    }

    loadLeague();

    return () => {
      mounted = false;
    };
  }, [leagueId]);

  return (
    <PortfolioPage mode="league" leagueId={leagueId} wrapWithPageContent />
  );
}
