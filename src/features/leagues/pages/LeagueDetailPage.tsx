import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageContent from "@/layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "../../../components/ui/button";
import { getDraftByLeague, type DraftRow } from "@/lib/drafts";
import { getPortfoliosByLeague } from "@/lib/portfolios";
import Leaderboard from "@/layouts/components/Leaderboard";

type League = {
  id: string;
  name: string;
  owner_id?: string;
  created_at?: string;
};

type Profile = {
  id: string;
  username?: string;
  email?: string;
};

export type PortfolioWithUser = {
  portfolio_id: number;
  previous_close_value: number;
  user_id: string;
  Profiles: {
    username?: string;
    avatar_url?: string;
  } | null;
};

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [league, setLeague] = useState<League | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<PortfolioWithUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageTitle(league ? `${league.name}` : "League");

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const { data: leagueData, error: leagueErr } = await supabase
          .from("Leagues")
          .select("*")
          .eq("league_id", id)
          .maybeSingle();

        if (leagueErr) throw leagueErr;
        if (!mounted) return;

        setLeague(leagueData as League | null);

        const ownerId = (leagueData as any)?.owner_id;
        if (ownerId) {
          const { data: ownerData } = await supabase
            .from("Profiles")
            .select("id, username, email")
            .eq("id", ownerId)
            .maybeSingle();

          if (mounted) setOwner(ownerData as Profile | null);
        }

        const draftData = await getDraftByLeague(Number(id));
        if (mounted) setDraft(draftData);

        const portfoliosData = await getPortfoliosByLeague(Number(id));
        if (mounted && portfoliosData) {
          const sorted = (portfoliosData as any[]).sort(
            (a, b) => b.previous_close_value - a.previous_close_value,
          );
          setLeaderboard(sorted);
        }
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
  }, [id]);

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
      <div className="max-w-3xl">
        {draft && (
          <Button onClick={() => navigate(`/draft/${id}`)}>
            {!draft.is_ended ? "Enter Draft Room" : "View Draft Results"}
          </Button>
        )}

        {/* ✅ Leaderboard Component */}
        <Leaderboard entries={leaderboard} currentUserId={profile?.id} />

        <p className="text-sm text-gray-500 mb-2">
          Created:{" "}
          {league.created_at
            ? new Date(league.created_at).toLocaleString()
            : "—"}
        </p>

        <p className="text-sm text-gray-500 mb-4">
          Owner: {owner?.username ?? owner?.email ?? "Unknown"}
        </p>

        <p className="text-sm text-gray-500 mb-4">
          Join Code:{" "}
          <span className="font-mono bg-gray-100 px-2 py-1 rounded">
            {(league as any).join_code}
          </span>
        </p>
      </div>
    </PageContent>
  );
}