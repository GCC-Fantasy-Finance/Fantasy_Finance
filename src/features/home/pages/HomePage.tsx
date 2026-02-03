import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageTitle } from "../../../hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getLeagueById } from "@/lib/leagues";

type PortfolioCard = {
  portfolio_id: number;
  is_solo: boolean;
  league_id?: number | null;
  previous_close_value?: number | null;
  reserve_value?: number | null;
  previous_close_value?: number | null;
  name: string;
};

function Home() {
  usePageTitle("Home");
  const navigate = useNavigate();
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
        const { data, error } = await supabase
          .from("Portfolios")
          .select("portfolio_id,is_solo,league_id,previous_close_value,reserve_value")
          .eq("user_id", user.id);

        if (error) throw error;
        const rows = (data ?? []) as any[];

        // Ensure a Solo portfolio exists
        const hasSolo = rows.some((r) => r.is_solo === true);
        let working = [...rows];
        if (!hasSolo) {
          const { data: inserted, error: insErr } = await supabase
            .from("Portfolios")
            .insert({ user_id: user.id, is_solo: true, previous_close_value: 10000, reserve_value: 10000 })
            .select("portfolio_id,is_solo,league_id,previous_close_value,reserve_value")
            .maybeSingle();
          if (!insErr && inserted) working.unshift(inserted);
        }

        // Enrich with display names
        const cards: PortfolioCard[] = [];
        for (const r of working) {
          let name = "Solo";
          if (!r.is_solo && r.league_id) {
            const league = await getLeagueById(Number(r.league_id));
            name = league?.name ?? "League";
          }
          cards.push({
            portfolio_id: Number(r.portfolio_id),
            is_solo: Boolean(r.is_solo),
            league_id: r.league_id ?? null,
            previous_close_value: r.previous_close_value ?? 0,
            reserve_value: r.reserve_value ?? 0,
            previous_close_value: r.previous_close_value ?? 0,
            name,
          });
        }
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
      <h2 className="text-xl font-semibold mb-4">My Portfolios</h2>
      {loading ? (
        <p className="text-gray-600">Loading...</p>
      ) : portfolios.length === 0 ? (
        <p className="text-gray-600">No portfolios yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {portfolios.map((p) => (
            <button
              key={p.portfolio_id}
              type="button"
              onClick={() => {
                if (p.is_solo) navigate("/solo");
                else navigate(`/league/${p.league_id}`);
              }}
              className="w-full text-left rounded-lg border shadow-sm px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{p.is_solo ? "Solo" : p.name}</div>
                <div className="text-sm text-gray-700">${Number(p.previous_close_value ?? 0).toFixed(2)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </PageContent>
  );
}

export default Home;
