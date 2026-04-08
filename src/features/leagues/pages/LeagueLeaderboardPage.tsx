import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PageContent from "@/layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import SearchIcon from "@/components/ui/search-icon";
import Leaderboard from "@/layouts/components/Leaderboard";
import LeagueMemberPortfolioModal from "@/components/ui/LeagueMemberPortfolioModal";
import InviteMembersModal from "@/components/ui/InviteMembersModal";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import Spinner from "@/components/ui/spinner";
import {
  fetchLeagueView,
  getCachedLeagueView,
  type LeagueOwner,
  type LeaguePortfolioWithUser,
  type LeagueView,
} from "@/hooks/fetchLeagueView";
import type { DraftRow } from "@/lib/drafts";

export default function LeagueLeaderboardPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { profile } = useAuth();
  const numericLeagueId = Number(leagueId);
  const cachedLeagueName = Number.isFinite(numericLeagueId)
    ? getCachedLeagueView(numericLeagueId)?.league?.name
    : undefined;

  const [league, setLeague] = useState<LeagueView | null>(null);
  const [owner, setOwner] = useState<LeagueOwner | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaguePortfolioWithUser[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] =
    useState<LeaguePortfolioWithUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  usePageTitle(league?.name ?? cachedLeagueName);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const numericLeagueId = Number(leagueId);
      if (!leagueId || !Number.isFinite(numericLeagueId)) {
        if (mounted) {
          setLeague(null);
          setOwner(null);
          setDraft(null);
          setLeaderboard([]);
          setLoading(false);
        }
        return;
      }

      setError(null);

      const cached = getCachedLeagueView(numericLeagueId);
      if (cached) {
        if (!mounted) return;
        setLeague(cached.league);
        setOwner(cached.owner);
        setDraft(cached.draft);
        setLeaderboard(cached.leaderboard);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const result = await fetchLeagueView(numericLeagueId, {
          useCache: true,
          forceRefresh: Boolean(cached),
        });
        if (!mounted) return;

        setLeague(result.league);
        setOwner(result.owner);
        setDraft(result.draft);
        setLeaderboard(result.leaderboard);
      } catch (err: any) {
        console.error("Error loading league leaderboard:", err);
        if (mounted) setError(err.message || "Failed to load league");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [leagueId]);

  useEffect(() => {
    const numericLeagueId = Number(leagueId);
    if (!leagueId || !Number.isFinite(numericLeagueId)) return;

    let isMounted = true;

    const refetchLeaderboard = async () => {
      try {
        const result = await fetchLeagueView(numericLeagueId, {
          useCache: false,
          forceRefresh: true,
        });
        if (!isMounted) return;
        setLeaderboard(result.leaderboard);
      } catch (err) {
        console.error("Error refreshing leaderboard:", err);
      }
    };

    const channel = supabase
      .channel(`league-portfolios-${numericLeagueId}`, {
        config: { broadcast: { self: true } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Portfolios",
        },
        (payload: any) => {
          if (!isMounted) return;

          const payloadLeagueId =
            payload.new?.league_id || payload.old?.league_id;
          if (
            payload.eventType === "DELETE" ||
            payloadLeagueId === numericLeagueId
          ) {
            refetchLeaderboard();
          }
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [leagueId]);

  if (loading) {
    return (
      <PageContent>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      </PageContent>
    );
  }

  if (error) {
    return (
      <PageContent>
        <p className="text-red-600">{error}</p>
      </PageContent>
    );
  }

  if (!league) {
    return (
      <PageContent>
        <p className="text-gray-600">League not found.</p>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <div className="max-w-3xl">
        <InviteMembersModal
          open={showInviteModal}
          leagueId={leagueId}
          leagueName={league?.name || ""}
          ownerName={owner?.username || ""}
          ownerId={league?.owner_id}
          leaderboard={leaderboard}
          onClose={() => setShowInviteModal(false)}
        />

        <div className="">
          <Leaderboard
            entries={leaderboard}
            currentUserId={profile?.id}
            onPortfolioClick={(portfolioId) => {
              const selectedEntry = leaderboard.find(
                (entry) => entry.portfolio_id === portfolioId,
              );
              if (selectedEntry) {
                setSelectedPortfolio(selectedEntry);
              }
            }}
          />
        </div>

        <LeagueMemberPortfolioModal
          open={Boolean(selectedPortfolio)}
          portfolioId={selectedPortfolio?.portfolio_id ?? null}
          memberName={selectedPortfolio?.Profiles?.username ?? "Unknown User"}
          memberAvatarUrl={selectedPortfolio?.Profiles?.avatar_url}
          memberUserId={selectedPortfolio?.user_id}
          leagueId={leagueId}
          leagueOwnerId={league?.owner_id}
          isLeagueOwner={profile?.id === league?.owner_id}
          badges={selectedPortfolio?.badges}
          joinedDate={selectedPortfolio?.Profiles?.created_at}
          fallbackNetValue={
            selectedPortfolio
              ? calculatePortfolioValue({
                  netValue:
                    selectedPortfolio.live_value ??
                    selectedPortfolio.previous_close_value,
                })
              : undefined
          }
          onClose={() => setSelectedPortfolio(null)}
        />

        {(!draft || !draft.is_started) && profile?.id === league?.owner_id && (
          <Button
            onClick={() => setShowInviteModal(true)}
            className="mt-6 flex items-center gap-2"
          >
            <SearchIcon className="w-4 h-4" />
            Invite Members
          </Button>
        )}
      </div>
    </PageContent>
  );
}
