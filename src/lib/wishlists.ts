import { supabase } from "./supabase";

export type WishlistItem = {
  wishlist_item_id?: number;
  portfolio_id: number;
  stock_id: number;
};

export const getWishlistByPortfolio = async (
  portfolioId: number
): Promise<WishlistItem[]> => {
  const { data, error } = await supabase
    .from("Wishlist Items")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("wishlist_item_id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export type WishlistItemInsert = {
  portfolio_id: number;
  stock_id: number;
};

export const addWishlistItem = async (
  item: WishlistItemInsert
) => {
  const { data, error } = await supabase
    .from('Wishlist Items')
    .insert(item)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

// Remove a wishlist item by portfolio_id and stock_id
export const removeWishlistItem = async (
  portfolio_id: number,
  stock_id: number
) => {
  const { error } = await supabase
    .from('Wishlist Items')
    .delete()
    .eq('portfolio_id', portfolio_id)
    .eq('stock_id', stock_id);

  if (error) {
    throw error;
  }
};