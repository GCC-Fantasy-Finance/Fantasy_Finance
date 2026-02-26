import { supabase } from "@/lib/supabase";

export type DraftPickRow = {
  draft_pick_id: number;
  draft_id: number;
  portfolio_id: number;
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
  portfolioId: number,
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

// check whether a stock exists in any draft pick
export async function isStockInDraftPicks(stockId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("Draft Picks")
    .select("stock_id")
    .eq("stock_id", stockId)
    .limit(1);

  if (error) {
    console.error("Failed to check draft picks for stock:", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}