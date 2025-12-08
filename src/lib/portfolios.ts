import { supabase } from "../lib/supabase";

// get all portfolios in a league
export async function getPortfoliosByLeague(leagueId: number) {
  const { data, error } = await supabase
    .from("Portfolios")
    .select("*")
    .eq("league_id", leagueId);

  if (error) throw error;
  return data;
}