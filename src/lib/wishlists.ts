import { supabase } from "./supabase";

export type WishlistItem = {
  wishlist_item_id: number;
  portfolio_id: number;
  stock_id: number;
  rank: number;
};

export type WishlistItemInsert = {
  portfolio_id: number;
  stock_id: number;
};

//
// GET — always ordered
//
export const getWishlistByPortfolio = async (
  portfolioId: number
): Promise<WishlistItem[]> => {
  const { data, error } = await supabase
    .from("Wishlist Items")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("rank", { ascending: true });

  if (error) throw error;
  return data ?? [];
};

//
// ADD — insert at bottom of queue
//
export const addWishlistItem = async (
  item: WishlistItemInsert
): Promise<WishlistItem> => {
  // Find current max rank
  const { data: existing } = await supabase
    .from("Wishlist Items")
    .select("rank")
    .eq("portfolio_id", item.portfolio_id)
    .order("rank", { ascending: false })
    .limit(1);

  const nextRank = existing && existing.length > 0 ? existing[0].rank + 1 : 0;

  const { data, error } = await supabase
    .from("Wishlist Items")
    .insert({ ...item, rank: nextRank })
    .select()
    .single();

  if (error) throw error;
  return data;
};

//
// REMOVE — delete and close rank gaps
//
export const removeWishlistItem = async (
  portfolio_id: number,
  stock_id: number
) => {
  const { error } = await supabase
    .from("Wishlist Items")
    .delete()
    .eq("portfolio_id", portfolio_id)
    .eq("stock_id", stock_id);

  if (error) throw error;

  // Re-rank remaining items
  await normalizeWishlistRanks(portfolio_id);
};

//
// REORDER — called after drag-and-drop
//
export const updateWishlistOrder = async (
  orderedItems: WishlistItem[]
) => {
  const updates = orderedItems.map((item, index) => ({
    wishlist_item_id: item.wishlist_item_id,
    rank: index,
  }));

  for (const row of updates) {
    await supabase
      .from("Wishlist Items")
      .update({ rank: row.rank })
      .eq("wishlist_item_id", row.wishlist_item_id);
  }
};

//
// NORMALIZE — ensures ranks are 0..n with no gaps
//
const normalizeWishlistRanks = async (portfolioId: number) => {
  const items = await getWishlistByPortfolio(portfolioId);

  for (let i = 0; i < items.length; i++) {
    if (items[i].rank !== i) {
      await supabase
        .from("Wishlist Items")
        .update({ rank: i })
        .eq("wishlist_item_id", items[i].wishlist_item_id);
    }
  }
};