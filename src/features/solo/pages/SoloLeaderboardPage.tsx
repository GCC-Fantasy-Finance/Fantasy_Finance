import { useEffect, useState } from "react";
import PageContent from "@/layouts/components/PageContent";
import { supabase } from "@/lib/supabase";
import Leaderboard, { type LeaderboardEntry } from "@/layouts/components/Leaderboard";
import { useAuth } from "@/context/AuthContext";

function SoloLeaderboardPage() {
  const { profile } = useAuth(); 
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSoloLeaderboard() {
      setLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase
          .from("Portfolios")
          .select(
            `
            portfolio_id,
            previous_close_value,
            user_id,
            Profiles (
              username,
              avatar_url
            )
          `,
          )
          .is("league_id", null)
          .eq("is_solo", true);

        if (error) throw error;
        if (!mounted) return;

        const sorted = (data || []).sort(
          (a, b) => b.previous_close_value - a.previous_close_value,
        );

        setEntries(sorted as LeaderboardEntry[]);
      } catch (err: any) {
        console.error("Error loading solo leaderboard:", err);
        if (mounted) setError(err.message || "Failed to load leaderboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSoloLeaderboard();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <PageContent>
      <div className="max-w-3xl">
        <p className="text-gray-600 mb-6">
          See how your solo portfolio stacks up against everyone else.
        </p>

        {loading && <p className="text-gray-600">Loading leaderboard…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && (
          <Leaderboard
            entries={entries}
            currentUserId={profile?.id}
          />
        )}
      </div>
    </PageContent>
  );
}

export default SoloLeaderboardPage;