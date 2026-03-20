import { useEffect, useState } from "react";

import { usePageTitle } from "../../../hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  getLeagueById,
  getUserRankInLeague,
  getUserRankInSoloLeaderboard,
  withLiveValues,
} from "@/lib/leagues";
import { getPortfoliosByUser } from "@/lib/portfolios";
import HomePageCard from "@/components/ui/homepagecard";

type PortfolioCard = {
  portfolio_id: number;
  is_solo: boolean;
  league_id?: number | null;
  net_value?: number | null;
  previous_close_value?: number | null;
  reserve_value?: number | null;
  name: string;
  rank?: number | null;
};

function Home() {
  usePageTitle("Home");
  
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<PortfolioCard[]>([]);

  useEffect(() => {
    async function load() {
      if (!user?.id) {
        setPortfolios([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await getPortfoliosByUser(user.id as unknown as number);
        const rows = (data ?? []) as any[];



        // Ensure a Solo portfolio exists
        const hasSolo = rows.some((r) => r.is_solo === true);
        let working = [...rows];
        if (!hasSolo) {
          const { data: inserted, error: insErr } = await supabase
            .from("Portfolios")
            .insert({ user_id: user.id, is_solo: true, previous_close_value: 10000, reserve_value: 10000, last_recalculated: new Date().toISOString() })
            .select("portfolio_id,is_solo,league_id,previous_close_value,reserve_value")
            .maybeSingle();

          if (!insErr && inserted?.portfolio_id) {
            const { error: historyError } = await supabase
              .from("Portfolio Histories")
              .insert([
                {
                  portfolio_id: inserted.portfolio_id,
                  value: 10000,
                },
              ]);

            if (historyError) {
              throw historyError;
            }
          }

          if (!insErr && inserted) working.unshift(inserted);
        }

        // Enrich with display names and ranks (batched in parallel)
        const leagueIds = Array.from(
          new Set(
            working
              .filter((r) => !r.is_solo && r.league_id)
              .map((r) => Number(r.league_id))
              .filter((leagueId) => Number.isFinite(leagueId))
          )
        );

        const [soloRank, leagueDetails, portfoliosWithNet] = await Promise.all([
          working.some((r) => r.is_solo)
            ? getUserRankInSoloLeaderboard(user.id)
            : Promise.resolve(null),
          Promise.all(
            leagueIds.map(async (leagueId) => {
              const [league, rank] = await Promise.all([
                getLeagueById(leagueId),
                getUserRankInLeague(leagueId, user.id),
              ]);
              return [
                leagueId,
                {
                  name: league?.name ?? "League",
                  rank,
                },
              ] as const;
            })
          ),
          withLiveValues(
            working.map((r) => ({
              portfolio_id: Number(r.portfolio_id),
              reserve_value: r.reserve_value ?? 0,
            }))
          ),
        ]);

        const leagueInfoById = new Map(leagueDetails);
        const netValueByPortfolioId = new Map(
          portfoliosWithNet.map((portfolio) => [
            Number(portfolio.portfolio_id),
            Number(portfolio.live_value ?? 0),
          ])
        );

        const cards: PortfolioCard[] = working.map((r) => {
          const isSolo = Boolean(r.is_solo);
          const leagueId = r.league_id != null ? Number(r.league_id) : null;
          const leagueInfo = leagueId != null ? leagueInfoById.get(leagueId) : null;

          return {
            portfolio_id: Number(r.portfolio_id),
            is_solo: isSolo,
            league_id: leagueId,
            net_value:
              netValueByPortfolioId.get(Number(r.portfolio_id)) ??
              Number(r.previous_close_value ?? 0),
            previous_close_value: r.previous_close_value ?? 0,
            reserve_value: r.reserve_value ?? 0,
            name: isSolo ? "Solo" : leagueInfo?.name ?? "League",
            rank: isSolo ? soloRank : leagueInfo?.rank ?? null,
          };
        });

        setPortfolios(cards);
      } catch (err) {
        console.error("Failed to load portfolios:", err);
        setPortfolios([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  return (
    <PageContent>
      <h2 className="text-xl font-semibold mb-4">Portfolios</h2>
      {loading ? (
        <p className="text-gray-600">Loading...</p>
      ) : portfolios.length === 0 ? (
        <p className="text-gray-600">No portfolios yet.</p>
      ) : (
        (() => {
          const soloPortfolio = portfolios.find((portfolio) => portfolio.is_solo);
          const leaguePortfolios = portfolios.filter((portfolio) => !portfolio.is_solo);

          return (
            <div className="flex flex-col gap-4">
              {soloPortfolio ? (
                <div className="w-[100%]">
                  <HomePageCard key={soloPortfolio.portfolio_id} {...soloPortfolio} />
                </div>
              ) : null}

              {leaguePortfolios.length > 0 ? (
                <>
                  <div className="w-[100%]">
                    <div className="h-px w-full bg-gray-300" />
                  </div>
                  <div className="w-[100%]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {leaguePortfolios.map((portfolio) => (
                        <HomePageCard key={portfolio.portfolio_id} {...portfolio} />
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          );
        })()
      )}
    </PageContent>
  );
}

export default Home;
