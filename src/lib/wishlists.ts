import { supabase } from "./supabase";

export type WishlistItem = {
  wishlist_item_id?: number; // optional because DB generates it
  portfolio_id: string;
  stock_id: number;
};

export const getWishlistByPortfolio = async (
  portfolioId: string
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
  portfolio_id: string;
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