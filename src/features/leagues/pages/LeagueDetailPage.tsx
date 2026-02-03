import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageContent from "@/layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDraftByLeague, type DraftRow } from "@/lib/drafts";
import { getPortfoliosByLeague } from "@/lib/portfolios";

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

type PortfolioWithUser = {
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
        // Fetch league
        const { data: leagueData, error: leagueErr } = await supabase
          .from("Leagues")
          .select("*")
          .eq("league_id", id)
          .maybeSingle();

        if (leagueErr) throw leagueErr;
        if (!mounted) return;

        setLeague(leagueData as League | null);

        // Fetch owner
        const ownerId = (leagueData as any)?.owner_id;
        if (ownerId) {
          const { data: ownerData } = await supabase
            .from("Profiles")
            .select("id, username, email")
            .eq("id", ownerId)
            .maybeSingle();

          if (mounted) setOwner(ownerData as Profile | null);
        }

        // Fetch draft
        const draftData = await getDraftByLeague(Number(id));
        if (mounted) setDraft(draftData);

        // Fetch portfolios for leaderboard
        const portfoliosData = await getPortfoliosByLeague(Number(id));
        if (mounted && portfoliosData) {
          // Sort by previous_close_value desc
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
        {/* Enter Draft Room button */}
        {draft && (
          <Button onClick={() => navigate(`/draft/${id}`)}>
            {!draft.is_ended && ("Enter Draft Room")}
            {draft.is_ended && ("View Draft Results")}
          </Button>
        )}

        <section className="my-6">
          <h2 className="text-lg font-semibold mb-3">Leaderboard</h2>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px] px-4">Rank</TableHead>
                  <TableHead className="px-4">Member</TableHead>
                  <TableHead className="px-4">Portfolio Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      No members yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  leaderboard.map((entry) => (
                    <TableRow
                      key={entry.portfolio_id}
                      className={
                        profile?.id === entry.user_id
                          ? "bg-green-50/60 hover:bg-green-100/60 font-semibold"
                          : ""
                      }
                    >
                      <TableCell className="font-bold text-lg px-4 pl-7 text-green-700">
                        {leaderboard.findIndex(
                          (p) => p.previous_close_value === entry.previous_close_value,
                        ) + 1}
                      </TableCell>
                      <TableCell className="flex items-center gap-2 px-4 py-3">
                        {entry.Profiles?.avatar_url ? (
                          <img
                            src={entry.Profiles.avatar_url}
                            alt={entry.Profiles.username ?? "User"}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm select-none">
                            {(
                              entry.Profiles?.username?.[0] ?? "U"
                            ).toUpperCase()}
                          </div>
                        )}
                        {entry.Profiles?.username ?? "Unknown User"}
                      </TableCell>
                      <TableCell className="px-4">
                        $
                        {entry.previous_close_value.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

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
          Join Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{(league as any).join_code}</span>
        </p>
      </div>
    </PageContent>
  );
}
