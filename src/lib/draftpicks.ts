import { supabase } from "@/lib/supabase";

export type DraftPickRow = {
  draft_pick_id: number;
  draft_id: number;
  portfolio_id: string;
  transaction_id: number;
  stock_id: number;
  round_number: number;
  pick_number: number;  
};

/* ================================
   Fetch all picks for a league
   ================================ */
export async function getDraftPicksByLeague(
  draftId: number
): Promise<DraftPickRow[]> {
  const { data, error } = await supabase
    .from("Draft Picks")
    .select("*")
    .eq("draft_id", draftId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load draft picks:", error);
    return [];
  }

  return data as DraftPickRow[];
}

/* ================================
   Insert a draft pick
   ================================ */
export async function insertDraftPick(
  draftId: number,
  portfolioId: string,
  transactionId: number,
  stockId: number,
  roundNumber: number,
  pickNumber: number
) {
  const { error } = await supabase.from("Draft Picks").insert({
    draft_id: draftId,
    portfolio_id: portfolioId,
    transaction_id: transactionId,
    stock_id: stockId,
    round_number: roundNumber,
    pick_number: pickNumber
  });

  if (error) {
    console.error("insertDraftPick failed:", error);
    throw error;
  }
}