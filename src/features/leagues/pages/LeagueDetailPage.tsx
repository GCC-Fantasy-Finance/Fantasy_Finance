import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageContent from "@/layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "../../../components/ui/button";
import SearchIcon from "../../../components/ui/search-icon";
import { type DraftRow } from "@/lib/drafts";
import Leaderboard from "@/layouts/components/Leaderboard";
import LeagueMemberPortfolioModal from "@/components/ui/LeagueMemberPortfolioModal";
import InviteMembersModal from "@/components/ui/InviteMembersModal";

import { calculatePortfolioValue } from "@/lib/portfolioValue";
import {
  fetchLeagueView,
  getCachedLeagueView,
} from "@/hooks/fetchLeagueView";
import type { UserBadgeView } from "@/lib/userBadges";

type League = {
  id: string;
  name: string;
  owner_id?: string;
  created_at?: string;
  finish_time?: string;
  join_code?: string;
};

type Profile = {
  id: string;
  username?: string;
  email?: string;
};

export type PortfolioWithUser = {
  portfolio_id: number;
  previous_close_value: number;
  reserve_value?: number;
  live_value?: number;
  user_id: string;
  Profiles: {
    username?: string;
    avatar_url?: string;
    created_at?: string;
  } | null;
  badges?: UserBadgeView[];
};

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [league, setLeague] = useState<League | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<PortfolioWithUser[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] =
    useState<PortfolioWithUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);

  usePageTitle(league ? `${league.name}` : "League");

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!leagueId) return;

      const numericLeagueId = Number(leagueId);

      setError(null);

      const cached = getCachedLeagueView(numericLeagueId);
      if (cached) {
        if (!mounted) return;
        setLeague(cached.league as League | null);
        setOwner(cached.owner as Profile | null);
        setDraft(cached.draft);
        setLeaderboard(cached.leaderboard as PortfolioWithUser[]);
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

        setLeague(result.league as League | null);
        setOwner(result.owner as Profile | null);
        setDraft(result.draft);
        setLeaderboard(result.leaderboard as PortfolioWithUser[]);
      } catch (err: any) {
        console.error("Error loading league:", err);
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

  const handleCopyJoinCode = async () => {
    const joinCode = String((league as any)?.join_code ?? "").trim();
    if (!joinCode) return;

    try {
      await navigator.clipboard.writeText(joinCode);
      setJoinCodeCopied(true);
      window.setTimeout(() => setJoinCodeCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy join code:", err);
      alert("Unable to copy join code. Please copy it manually.");
    }
  };

  // Subscribe to real-time portfolio changes (members joining/leaving)
  useEffect(() => {
    if (!leagueId) return;

    let isMounted = true;
    const numericLeagueId = Number(leagueId);

    const refetchLeaderboard = async () => {
      try {
        const result = await fetchLeagueView(numericLeagueId, {
          useCache: false,
          forceRefresh: true,
        });
        if (!isMounted) return;
        setLeaderboard(result.leaderboard as PortfolioWithUser[]);
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
          
          const payloadLeagueId = payload.new?.league_id || payload.old?.league_id;
          
          // For DELETE events, payload.old only contains the primary key
          // So we can't determine the league. Refetch anyway since deletions are rare.
          if (payload.eventType === "DELETE" || payloadLeagueId === numericLeagueId) {
            console.log(`Portfolio ${payload.eventType} detected, refetching leaderboard...`);
            refetchLeaderboard();
          }
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log("Leaderboard subscribed to live portfolio updates");
        }
      });

    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [leagueId]);

  if (loading) {
    return (
      <PageContent>
        <p className="text-gray-600">Loading league…</p>
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
      {loading && (
        <div className="flex items-center justify-center py-12 mb-8">
          <p className="text-gray-600">Loading league…</p>
        </div>
      )}
      <div className="max-w-3xl">
        {(!draft || !draft.is_started) && profile?.id === league?.owner_id && (
          <Button onClick={() => setShowInviteModal(true)} className="mb-6 flex items-center gap-2">
            <SearchIcon className="w-4 h-4" />
            Invite Members
          </Button>
        )}

        <InviteMembersModal
          open={showInviteModal}
          leagueId={leagueId}
          leagueName={league?.name || ""}
          ownerName={owner?.username || ""}
          ownerId={league?.owner_id}
          leaderboard={leaderboard}
          onClose={() => setShowInviteModal(false)}
        />

        

        {draft && (
          <Button onClick={() => navigate(`/draft/${leagueId}`)}>
            {!draft.is_ended ? "Enter Draft Room" : "View Draft Results"}
          </Button>
        )}
        <div className="my-6">
          <Leaderboard
            entries={leaderboard}
            currentUserId={profile?.id}
            onPortfolioClick={(portfolioId) => {
              const selectedEntry = leaderboard.find(
                (entry) => entry.portfolio_id === portfolioId
              );
              if (selectedEntry) {
                console.log("DEBUG LeagueDetailPage: selectedEntry =", selectedEntry);
                console.log("DEBUG LeagueDetailPage: user_id =", selectedEntry.user_id);
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

        <p className="text-sm text-gray-500 mb-2">
          Created:{" "}
          {league.created_at
            ? new Date(league.created_at).toLocaleString()
            : "—"}
        </p>

        <p className="text-sm text-gray-500 mb-4">
          Owner: {owner?.username ?? owner?.email ?? "Unknown"}
        </p>

        <div className="text-sm text-gray-500 mb-4 flex items-center gap-2 flex-wrap">
          <span>Join Code:</span>
          <button
            type="button"
            aria-label="Copy join code"
            title="Copy join code"
            onClick={handleCopyJoinCode}
            className="relative group font-mono bg-gray-100 px-2 py-1 rounded cursor-pointer overflow-hidden"
          >
            <span
              className={`transition-opacity duration-150 ${joinCodeCopied ? "opacity-0" : "group-hover:opacity-0"}`}
            >
              {(league as any).join_code}
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${joinCodeCopied ? "opacity-100 text-green-700" : "opacity-0 group-hover:opacity-100"}`}
            >
              {joinCodeCopied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>

        {/* Leave League */}
        <Button
          variant="outline"
          className="mt-1 mx-2 text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
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
    </PageContent>
  );
}
