import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

interface StockPriceContextType {
  stockPrices: Record<number, number>;
}

const StockPriceContext = createContext<StockPriceContextType | undefined>(undefined);

export function StockPriceProvider({ children }: { children: ReactNode }) {
  const [stockPrices, setStockPrices] = useState<Record<number, number>>({});

  useEffect(() => {
    const channel = supabase
      .channel("live-stock-prices")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Stocks" },
        (payload) => {
          const updated = payload.new as { stock_id: number; current_price: number };
          setStockPrices((prev) => ({
            ...prev,
            [updated.stock_id]: updated.current_price,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <StockPriceContext.Provider value={{ stockPrices }}>
      {children}
    </StockPriceContext.Provider>
  );
}

export function useStockPrices() {
  const ctx = useContext(StockPriceContext);
  if (!ctx) {
    throw new Error("useStockPrices must be used within a StockPriceProvider");
  }
  return ctx.stockPrices;
}
