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
import { calculatePortfolioValue } from "@/lib/portfolioValue";

type League = {
  id: string;
  name: string;
  owner_id?: string;
  created_at?: string;
  finish_time?: string;
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
  } | null;
};

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
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
      if (!leagueId) return;

      setLoading(true);
      setError(null);

      try {
        const { data: leagueData, error: leagueErr } = await supabase
          .from("Leagues")
          .select("*")
          .eq("league_id", leagueId)
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

        const draftData = await getDraftByLeague(Number(leagueId));
        if (mounted) setDraft(draftData);

        const portfoliosData = await getPortfoliosByLeague(Number(leagueId));
        if (mounted && portfoliosData) {
          const portfolios = portfoliosData as PortfolioWithUser[];
          const portfolioIds = portfolios.map(
            (portfolio) => portfolio.portfolio_id,
          );

          let holdingsByPortfolio = new Map<
            number,
            Array<{
              quantity?: number | null;
              stock?: { current_price?: number | null };
            }>
          >();

          if (portfolioIds.length > 0) {
            const { data: holdingsRows } = await supabase
              .from("Portfolio Holdings")
              .select("portfolio_id, stock_id, quantity")
              .in("portfolio_id", portfolioIds);

            const stockIds = [
              ...new Set(
                (holdingsRows ?? [])
                  .map((holding: any) => Number(holding.stock_id))
                  .filter((stockId) => Number.isFinite(stockId)),
              ),
            ];

            const stockPricesById = new Map<number, number>();
            if (stockIds.length > 0) {
              const { data: stockRows } = await supabase
                .from("Stocks")
                .select("stock_id, current_price")
                .in("stock_id", stockIds);

              for (const stock of stockRows ?? []) {
                stockPricesById.set(
                  Number((stock as any).stock_id),
                  Number((stock as any).current_price ?? 0),
                );
              }
            }

            holdingsByPortfolio = (holdingsRows ?? []).reduce(
              (map, holding: any) => {
                const portfolioId = Number(holding.portfolio_id);
                const list = map.get(portfolioId) ?? [];
                list.push({
                  quantity: Number(holding.quantity ?? 0),
                  stock: {
                    current_price:
                      stockPricesById.get(Number(holding.stock_id)) ?? 0,
                  },
                });
                map.set(portfolioId, list);
                return map;
              },
              new Map<
                number,
                Array<{
                  quantity?: number | null;
                  stock?: { current_price?: number | null };
                }>
              >(),
            );
          }

          const withLiveValues = portfolios.map((portfolio) => ({
            ...portfolio,
            live_value: calculatePortfolioValue({
              holdings: holdingsByPortfolio.get(portfolio.portfolio_id) ?? [],
              reserveValue: portfolio.reserve_value,
            }),
          }));

          const sorted = withLiveValues.sort(
            (a, b) => Number(b.live_value ?? 0) - Number(a.live_value ?? 0),
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
      <div className="max-w-3xl">
        {draft && (
          <Button onClick={() => navigate(`/draft/${leagueId}`)}>
            {!draft.is_ended ? "Enter Draft Room" : "View Draft Results"}
          </Button>
        )}
        <div className="my-6">
          <Leaderboard entries={leaderboard} currentUserId={profile?.id} />
        </div>

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

        {/* Leave League */}
        <Button
          variant="outline"
          className="mt-1 text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
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
