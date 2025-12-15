import { supabase } from "../lib/supabase";

// get the draft of a league
export async function getDraftByLeague(leagueId: number) {
  const { data, error } = await supabase
    .from("Drafts")
    .select("*")
    .eq("league_id", leagueId)
    .single();

  if (error) throw error;
  return data;
}