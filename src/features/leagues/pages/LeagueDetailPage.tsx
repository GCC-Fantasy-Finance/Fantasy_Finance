import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageContent from "@/layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  fetchLeagueView,
  getCachedLeagueView,
  type LeagueOwner,
  type LeagueView,
} from "@/hooks/fetchLeagueView";
import Spinner from "@/components/ui/spinner";

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const numericLeagueId = Number(leagueId);
  const cachedLeagueName = Number.isFinite(numericLeagueId)
    ? getCachedLeagueView(numericLeagueId)?.league?.name
    : undefined;

  const [league, setLeague] = useState<LeagueView | null>(null);
  const [owner, setOwner] = useState<LeagueOwner | null>(null);
  const [hasActiveDraft, setHasActiveDraft] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);

  usePageTitle(league?.name ?? cachedLeagueName);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const numericLeagueId = Number(leagueId);
      if (!leagueId || !Number.isFinite(numericLeagueId)) {
        if (mounted) {
          setLeague(null);
          setOwner(null);
          setHasActiveDraft(false);
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
        setHasActiveDraft(Boolean(cached.draft && !cached.draft.is_ended));
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
        setHasActiveDraft(Boolean(result.draft && !result.draft.is_ended));
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
    const joinCode = String(league?.join_code ?? "").trim();
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
      <div className="max-w-3xl flex flex-col">
        <h2 className="text-xl font-semibold mb-4">League Details</h2>
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
              {league.join_code ?? "—"}
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${joinCodeCopied ? "opacity-100 text-green-700" : "opacity-0 group-hover:opacity-100"}`}
            >
              {joinCodeCopied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>

        <Button
          variant="outline"
          className="mb-4 self-start"
          onClick={() => navigate(`/draft/${leagueId}`)}
        >
          Enter Draft Room
        </Button>

        <Button
          variant="outline"
          className="mt-1 self-start text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
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
                      }),
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
