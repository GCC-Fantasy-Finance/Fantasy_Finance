import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageContent from "@/layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { supabase } from "@/lib/supabase";
import { Button } from "../../../components/ui/button";
import { getDraftByLeague, type DraftRow } from "@/lib/drafts";

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

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [league, setLeague] = useState<League | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);

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
        <h1 className="text-2xl font-semibold mb-2">
          {league.name}
        </h1>

        <p className="text-sm text-gray-500 mb-4">
          Created:{" "}
          {league.created_at
            ? new Date(league.created_at).toLocaleString()
            : "—"}
        </p>

        <section className="mb-6">
          <h2 className="text-sm font-medium text-gray-700">
            Owner
          </h2>
          <p className="text-gray-800">
            {owner?.username ?? owner?.email ?? "Unknown"}
          </p>
        </section>

        {/* Enter Draft Room button */}
        {draft && !draft.is_ended && (
          <Button onClick={() => navigate(`/draft/${id}`)}>
            Enter Draft Room
          </Button>
        )}
      </div>
    </PageContent>
  );
}