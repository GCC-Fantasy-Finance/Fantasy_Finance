import { getDraftByLeague, type DraftRow } from "@/lib/drafts";
import { getPortfoliosByLeague } from "@/lib/portfolios";
import { buildSortedLeaderboardEntries } from "@/lib/leagues";
import { supabase } from "@/lib/supabase";
import { getBadgesbyUserBadges, type UserBadgeView } from "@/lib/userBadges";

export type LeagueView = {
  league_id: number;
  name: string;
  owner_id?: string;
  created_at?: string;
  finish_time?: string;
  join_code?: string;
};

export type LeagueOwner = {
  id: string;
  username?: string;
  email?: string;
};

export type LeaguePortfolioWithUser = {
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

export type LeagueViewResult = {
  league: LeagueView | null;
  owner: LeagueOwner | null;
  draft: DraftRow | null;
  leaderboard: LeaguePortfolioWithUser[];
};

const LEAGUE_VIEW_CACHE_TTL_MS = 15_000;
const leagueViewCache = new Map<
  number,
  { value: LeagueViewResult; expiresAt: number }
>();
const inFlightLeagueViewRequests = new Map<number, Promise<LeagueViewResult>>();

export function getCachedLeagueView(leagueId: number): LeagueViewResult | null {
  const cached = leagueViewCache.get(leagueId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    leagueViewCache.delete(leagueId);
    return null;
  }
  return cached.value;
}

export function invalidateCachedLeagueView(leagueId?: number) {
  if (typeof leagueId !== "number") {
    leagueViewCache.clear();
    return;
  }
  leagueViewCache.delete(leagueId);
}

export async function fetchLeagueView(
  leagueId: number,
  options?: { useCache?: boolean; forceRefresh?: boolean }
): Promise<LeagueViewResult> {
  const useCache = options?.useCache !== false;
  const forceRefresh = options?.forceRefresh === true;

  if (useCache && !forceRefresh) {
    const cached = getCachedLeagueView(leagueId);
    if (cached) return cached;
  }

  const inFlight = inFlightLeagueViewRequests.get(leagueId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const { data: leagueData, error: leagueErr } = await supabase
      .from("Leagues")
      .select("league_id,name,owner_id,created_at,finish_time,join_code")
      .eq("league_id", leagueId)
      .maybeSingle();

    if (leagueErr || !leagueData) {
      const emptyResult: LeagueViewResult = {
        league: null,
        owner: null,
        draft: null,
        leaderboard: [],
      };
      leagueViewCache.set(leagueId, {
        value: emptyResult,
        expiresAt: Date.now() + LEAGUE_VIEW_CACHE_TTL_MS,
      });
      return emptyResult;
    }

    const [ownerResult, draftData, portfoliosData] = await Promise.all([
      leagueData.owner_id
        ? supabase
            .from("Profiles")
            .select("id, username, email")
            .eq("id", leagueData.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      getDraftByLeague(leagueId),
      getPortfoliosByLeague(leagueId),
    ]);

    const portfolios = (portfoliosData ?? []) as LeaguePortfolioWithUser[];
    const leaderboard = await buildSortedLeaderboardEntries(portfolios);

    // Fetch badges for all users in the leaderboard
    const leaderboardWithBadges = await Promise.all(
      leaderboard.map(async (entry) => ({
        ...entry,
        badges: await getBadgesbyUserBadges(entry.user_id),
      }))
    );

    const result: LeagueViewResult = {
      league: leagueData as LeagueView,
      owner: (ownerResult.data as LeagueOwner | null) ?? null,
      draft: draftData,
      leaderboard: leaderboardWithBadges,
    };

    leagueViewCache.set(leagueId, {
      value: result,
      expiresAt: Date.now() + LEAGUE_VIEW_CACHE_TTL_MS,
    });

    return result;
  })();

  inFlightLeagueViewRequests.set(leagueId, request);

  try {
    return await request;
  } finally {
    inFlightLeagueViewRequests.delete(leagueId);
  }
}

export function prefetchLeagueView(leagueId: number) {
  void fetchLeagueView(leagueId, { useCache: true }).catch(() => {
    return;
  });
}

