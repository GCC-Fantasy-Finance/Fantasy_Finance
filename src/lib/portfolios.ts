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

// get all portfolios of a user
export async function getPortfoliosByUser(UserId: number) {
  const { data, error } = await supabase
    .from("Portfolios")
    .select("*")
    .eq("user_id", UserId);

  if (error) throw error;
  return data;
}

// get all portfolios of a user
export async function getPortfoliosByLeagueAndUser(LeagueId: number, UserId: number) {
  const { data, error } = await supabase
    .from("Portfolios")
    .select("*")
    .eq("league_id", LeagueId)
    .eq("user_id", UserId);

  if (error) throw error;
  return data;
}