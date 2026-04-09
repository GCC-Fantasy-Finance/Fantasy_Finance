import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export interface TradeStock {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  logo_url?: string | null;
}

export interface TradePortfolio {
  portfolio_id: number;
  reserve_value: number;
}

interface TradeModalState {
  buyOpen: boolean;
  sellOpen: boolean;
  stock: TradeStock | null;
  portfolio: TradePortfolio | null;
  holdingQty?: number | null;
}

interface TradeModalContextType extends TradeModalState {
  openBuy: (payload: { stock: TradeStock; portfolio: TradePortfolio }) => void;
  closeBuy: () => void;
  openSell: (payload: { stock: TradeStock; portfolio: TradePortfolio; holdingQty: number }) => void;
  closeSell: () => void;
}

const TradeModalContext = createContext<TradeModalContextType | undefined>(undefined);

export function TradeModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TradeModalState>({ buyOpen: false, sellOpen: false, stock: null, portfolio: null, holdingQty: null });

  function openBuy(payload: { stock: TradeStock; portfolio: TradePortfolio }) {
    setState({ buyOpen: true, sellOpen: false, stock: payload.stock, portfolio: payload.portfolio, holdingQty: null });
  }
  function closeBuy() {
    setState({ buyOpen: false, sellOpen: false, stock: null, portfolio: null, holdingQty: null });
  }

  function openSell(payload: { stock: TradeStock; portfolio: TradePortfolio; holdingQty: number }) {
    setState({ buyOpen: false, sellOpen: true, stock: payload.stock, portfolio: payload.portfolio, holdingQty: payload.holdingQty });
  }
  function closeSell() {
    setState({ buyOpen: false, sellOpen: false, stock: null, portfolio: null, holdingQty: null });
  }

  return (
    <TradeModalContext.Provider value={{ ...state, openBuy, closeBuy, openSell, closeSell }}>
      {children}
    </TradeModalContext.Provider>
  );
}

export function useTradeModal() {
  const ctx = useContext(TradeModalContext);
  if (!ctx) throw new Error("useTradeModal must be used within a TradeModalProvider");
  return ctx;
}
