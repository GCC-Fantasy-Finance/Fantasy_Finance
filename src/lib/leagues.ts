import { supabase } from "@/lib/supabase";

/* ================================
   Types
   ================================ */
export type LeagueRow = {
  league_id: number;
  name: string;
  created_at: string;
  start_time: string;
  finish_time: string;
  has_trading: boolean;
  has_drafting: boolean;
  sectors: string[];
  owner_id: string;
  is_ended: boolean;
};

/* ================================
   Fetch league by ID
   ================================ */
export async function getLeagueById(
  leagueId: number
): Promise<LeagueRow | null> {
  const { data, error } = await supabase
    .from("Leagues")
    .select("*")
    .eq("league_id", leagueId)
    .single();

  if (error) {
    console.error("Failed to load league:", error);
    return null;
  }

  return data as LeagueRow;
}

export async function getSectorByLeagueId(
  league_Id: number
): Promise<string[]> {
  const { data: leagueData, error: leagueError } = await supabase
        .from("Leagues")
        .select("sectors")
        .eq("league_id", league_Id)
        .single();
  
      if (leagueError) {
        console.error(leagueError);
        
        return [];
      }
  
      return leagueData?.sectors ?? [];
}