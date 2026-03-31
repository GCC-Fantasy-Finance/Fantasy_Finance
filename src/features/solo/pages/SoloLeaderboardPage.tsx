import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Leaderboard, {
  type LeaderboardEntry,
} from "@/layouts/components/Leaderboard";
import { useAuth } from "@/context/AuthContext";
import { buildSortedLeaderboardEntries } from "@/lib/leagues";
import { getBadgesbyUserBadges } from "@/lib/userBadges";

const SOLO_LEADERBOARD_CACHE_TTL_MS = 15_000;

type SoloLeaderboardCacheValue = {
  entries: LeaderboardEntry[];
};

const soloLeaderboardCache = new Map<
  number,
  { value: SoloLeaderboardCacheValue; expiresAt: number }
>();
const inFlightSoloLeaderboardRequests = new Map<
  number,
  Promise<SoloLeaderboardCacheValue>
>();

function getCachedSoloLeaderboard(
  userId: number
): SoloLeaderboardCacheValue | null {
  const cached = soloLeaderboardCache.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    soloLeaderboardCache.delete(userId);
    return null;
  }
  return cached.value;
}

function setCachedSoloLeaderboard(
  userId: number,
  value: SoloLeaderboardCacheValue
) {
  soloLeaderboardCache.set(userId, {
    value,
    expiresAt: Date.now() + SOLO_LEADERBOARD_CACHE_TTL_MS,
  });
}

async function fetchSoloLeaderboardData(): Promise<SoloLeaderboardCacheValue> {
  const { data, error } = await supabase
    .from("Portfolios")
    .select(
      `
      portfolio_id,
      previous_close_value,
      reserve_value,
      user_id,
      Profiles (
        username,
        avatar_url,
        created_at
      )
    `,
    )
    .is("league_id", null)
    .eq("is_solo", true);

  if (error) throw error;

  const portfolios =
    (data as Array<
      LeaderboardEntry & { reserve_value?: number | null }
    >) ?? [];

  const sorted = await buildSortedLeaderboardEntries(portfolios);

  // Fetch badges for all users in the leaderboard
  const entriesWithBadges = await Promise.all(
    sorted.map(async (entry) => ({
      ...entry,
      badges: await getBadgesbyUserBadges(entry.user_id),
    }))
  );

  return { entries: entriesWithBadges as LeaderboardEntry[] };
}

async function getSoloLeaderboard(
  userId: number,
  options?: { forceRefresh?: boolean }
): Promise<SoloLeaderboardCacheValue> {
  if (!options?.forceRefresh) {
    const cached = getCachedSoloLeaderboard(userId);
    if (cached) return cached;
  }

  const inFlight = inFlightSoloLeaderboardRequests.get(userId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const data = await fetchSoloLeaderboardData();
    setCachedSoloLeaderboard(userId, data);
    return data;
  })();

  inFlightSoloLeaderboardRequests.set(userId, request);

  try {
    return await request;
  } finally {
    inFlightSoloLeaderboardRequests.delete(userId);
  }
}

function SoloLeaderboardPage() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSoloLeaderboard() {
      if (!profile?.id) return;

      const cached = getCachedSoloLeaderboard(Number(profile.id));
      if (cached) {
        setEntries(cached.entries);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await getSoloLeaderboard(Number(profile.id), {
          forceRefresh: Boolean(cached),
        });
        if (mounted) {
          setEntries(data.entries);
          setError(null);
        }
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
  }, [profile?.id]);

  return (
    <div className="max-w-3xl">
      {loading && <p className="text-gray-600">Loading leaderboard…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <Leaderboard entries={entries} currentUserId={profile?.id} />
      )}
    </div>
  );
}

export default SoloLeaderboardPage;
