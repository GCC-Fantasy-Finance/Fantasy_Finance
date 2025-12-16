import { supabase } from "@/lib/supabase";

export type DraftRow = {
  id: number;
  league_id: number;
  current_portfolio_id: string | null;
  current_round: number;
  total_rounds: number;
  is_started: boolean;
  is_ended: boolean;
  is_snaking_forward: boolean;
  timer_start_time: string | null;
};

export type Portfolio = {
  portfolio_id: string;
  user_id: string;
  reserve_value: number;
  Profiles?: {
    username: string;
  };
};

/* ================================
   Fetch draft for a league
   ================================ */
export async function getDraftByLeague(leagueId: number): Promise<DraftRow | null> {
  const { data, error } = await supabase
    .from("Drafts")
    .select("*")
    .eq("league_id", leagueId)
    .single();

  if (error) {
    console.error("Failed to load draft:", error);
    return null;
  }

  return data as DraftRow;
}

/* ================================
   Start draft
   ================================ */
export async function startDraft(leagueId: number, firstPortfolioId: string) {
  const { error } = await supabase
    .from("Drafts")
    .update({
      is_started: true,
      is_ended: false,
      current_round: 1,
      current_pick: 0,
      is_snaking_forward: true,
      current_portfolio_id: firstPortfolioId,
      timer_start_time: new Date().toISOString(),
    })
    .eq("league_id", leagueId);

  if (error) console.error("startDraft failed:", error);
}

/* ================================
   Advance pick logic centralized
   ================================ */
export async function advanceDraft(
  leagueId: number,
  users: Portfolio[],
  currentPick: number,
  round: number,
  direction: "forward" | "backward",
  totalRounds: number
) {
  let nextPick = currentPick;
  let nextRound = round;
  let nextDirection = direction;

  if (direction === "forward") {
    nextPick++;
    if (nextPick >= users.length) {
      nextPick = users.length - 1;
      nextDirection = "backward";
      nextRound++;
    }
  } else {
    nextPick--;
    if (nextPick < 0) {
      nextPick = 0;
      nextDirection = "forward";
      nextRound++;
    }
  }

  const isDraftEnded = nextRound > totalRounds;
  const nextPortfolioId = isDraftEnded ? null : users[nextPick].portfolio_id;

  const { error } = await supabase
    .from("Drafts")
    .update({
      current_round: nextRound,
      current_pick: nextPick,
      current_portfolio_id: nextPortfolioId,
      is_snaking_forward: nextDirection === "forward",
      timer_start_time: isDraftEnded ? null : new Date().toISOString(),
      is_ended: isDraftEnded,
    })
    .eq("league_id", leagueId);

  if (error) console.error("advanceDraft failed:", error);

  return { nextPick, nextRound, nextDirection, isDraftEnded };
}