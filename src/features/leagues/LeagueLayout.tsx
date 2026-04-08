import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import SubNav from "@/layouts/components/SubNav";
import { fetchLeagueView, getCachedLeagueView } from "@/hooks/fetchLeagueView";

export default function LeagueLayout() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadDraftVisibility() {
      const numericLeagueId = Number(leagueId);
      if (!leagueId || !Number.isFinite(numericLeagueId)) {
        if (mounted) setHasDraft(false);
        return;
      }

      const cached = getCachedLeagueView(numericLeagueId);
      if (cached && mounted) {
        setHasDraft(Boolean(cached.draft));
      }

      try {
        const result = await fetchLeagueView(numericLeagueId, {
          useCache: true,
          forceRefresh: Boolean(cached),
        });
        if (!mounted) return;
        setHasDraft(Boolean(result.draft));
      } catch {
        if (mounted) setHasDraft(Boolean(cached?.draft));
      }
    }

    loadDraftVisibility();

    return () => {
      mounted = false;
    };
  }, [leagueId]);

  const subNavItems = [
    { name: "Portfolio", path: `/league/${leagueId}/portfolio` },
    { name: "Leaderboard", path: `/league/${leagueId}/leaderboard` },
    { name: "Details", path: `/league/${leagueId}/details` },
    ...(hasDraft
      ? [
          {
            name: "Enter Draft Room",
            path: `/draft/${leagueId}`,
            variant: "cta" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <SubNav items={subNavItems} />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-6xl">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
