import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PortfolioPage from "@/features/portfolio/pages/PortfolioPage";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCachedLeagueView } from "@/hooks/fetchLeagueView";
import { getLeagueById, type LeagueRow } from "@/lib/leagues";

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

      const leagueData = await getLeagueById(numericLeagueId);
      if (!mounted) return;

      setLeague(leagueData);
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
