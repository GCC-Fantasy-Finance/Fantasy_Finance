import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface StockRow {
  stock_id?: number;
  stock_symbol?: string;
  name?: string;
  current_price?: number;
}

export function useStock(symbol: string) {
  const [stock, setStock] = useState<StockRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchStock() {
      setLoading(true);
      try {
        const res = await supabase
          .from("Stocks")
          .select("stock_id, stock_symbol, name, current_price")
          .eq("stock_symbol", symbol)
          .maybeSingle();

        // Debug: log the raw response (helps diagnose RLS/permission issues)
        console.debug("useStock: supabase response", res);

        if (!mounted) return;
        // if there is an error from Supabase, surface it
        if (res.error) {
          setError(res.error);
          setStock(null);
        } else if (!res.data) {
          // No data and no error often indicates Row Level Security (RLS) or permission restrictions
          const noRowErr = new Error(
            "No row returned for symbol. Possible Row Level Security (RLS) or permission issue."
          );
          setError(noRowErr);
          setStock(null);
        } else {
          setStock((res.data as StockRow) ?? null);
        }
      } catch (err) {
        setError(err);
        setStock(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchStock();
    return () => {
      mounted = false;
    };
  }, [symbol]);

  return { stock, loading, error };
}
