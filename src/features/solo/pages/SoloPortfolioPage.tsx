import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { usePageTitle } from "@/hooks/usePageTitle";
import { toast } from "sonner";
import { fetchPortfolioView } from "@/hooks/fetchPortfolio";
import { useTradeModal } from "@/context/TradeModalContext";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import PortfolioChart from "@/components/ui/portfolioChart";
import { getStockById } from "@/lib/stocks";

interface HoldingView {
  portfolio_holding_id?: number;
  portfolio_id?: number;
  stock_id?: number;
  quantity?: number;
  average_buy_price?: number;
  stock?: {
    stock_id?: number;
    stock_symbol?: string;
    name?: string;
    current_price?: number;
    previous_close?: number;
    sector?: string;
  };
}

interface Stock {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  previous_close: number;
  sector: string;
}

function SoloPortfolioPage() {
  usePageTitle("Solo Portfolio");
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [totals, setTotals] = useState<{ previous_close_value?: number; reserve_value?: number } | null>(null);
  const [portfolio, setPortfolio] = useState<{ portfolio_id: number } | null>(null);
  const { openSell, openBuy } = useTradeModal();

  const [stockDetailsModalOpen, setStockDetailsModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null); // ✅ FIX

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    if (!auth.user) {
      setHoldings([]);
      setTotals(null);
      setLoading(false);
      return;
    }

    try {
      const { portfolio: pf, totals, holdings } = await fetchPortfolioView({
        userId: auth.user.id,
        isSolo: true,
      });

      if (!pf) {
        setHoldings([]);
        setTotals(null);
        setPortfolio(null);
      } else {
        setTotals(totals);
        setHoldings(holdings as HoldingView[]);
        setPortfolio({ portfolio_id: pf.portfolio_id });

        const investedValue = (holdings as HoldingView[]).reduce((sum, h) => {
          return sum + Number(h.stock?.current_price ?? 0) * Number(h.quantity ?? 0);
        }, 0);

        const reserveValue = Number(totals?.reserve_value ?? 0);
        const netValue = investedValue + reserveValue;

        // Persist NET to portfolio.previous_close_value
        try {
          await supabase
            .from("Portfolios")
            .update({ previous_close_value: netValue })
            .eq("portfolio_id", pf.portfolio_id);
        } catch (e) {
          console.warn("Unable to update previous_close_value (RLS/permissions?):", e);
        }
      }
    } catch (err) {
      console.error("Error loading holdings:", err);
      setHoldings([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [auth.user]);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  function handleBuy(h: HoldingView) {
    if (!auth.user || !h.stock_id || !h.stock?.current_price || !portfolio) {
      toast.error("Invalid stock or portfolio");
      return;
    }

    openBuy({
      stock: {
        stock_id: h.stock.stock_id!,
        stock_symbol: h.stock.stock_symbol ?? "",
        name: h.stock.name ?? "",
        current_price: Number(h.stock.current_price ?? 0),
      },
      portfolio: {
        portfolio_id: portfolio.portfolio_id,
        reserve_value: Number(totals?.reserve_value ?? 0),
      },
    });
  }

  function handleSell(h: HoldingView) {
    if (!auth.user || !h.stock?.stock_id || !portfolio) {
      toast.error("Invalid stock or portfolio");
      return;
    }

    const qty = Number(h.quantity ?? 0);
    if (qty <= 0) {
      toast.error("No shares to sell");
      return;
    }

    openSell({
      stock: {
        stock_id: h.stock.stock_id!,
        stock_symbol: h.stock.stock_symbol ?? "",
        name: h.stock.name ?? "",
        current_price: Number(h.stock.current_price ?? 0),
      },
      portfolio: {
        portfolio_id: portfolio.portfolio_id,
        reserve_value: Number(totals?.reserve_value ?? 0),
      },
      holdingQty: qty,
    });
  }

  // ✅ NEW: extracted + typed stock modal opener
  const handleOpenStockDetails = async (stockId?: number) => {
    if (!stockId) return;

    setStockDetailsModalOpen(true);

    try {
      const stock = await getStockById(stockId);
      setSelectedStock(stock);
    } catch {
      toast.error("Failed to load stock details");
      setStockDetailsModalOpen(false);
    }
  };

  return (
    <>
      {loading ? (
        <p className="text-gray-600">Loading portfolio...</p>
      ) : holdings.length === 0 ? (
        <p className="text-gray-600">No holdings yet.</p>
      ) : (
        <div>
          {totals && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-gray-300 shadow px-6 py-4 bg-white w-full h-[160px] max-w-sm">
                {(() => {
                  const investedValue = holdings.reduce((sum, h) => {
                    return sum + Number(h.stock?.current_price ?? 0) * Number(h.quantity ?? 0);
                  }, 0);
                  const netValue = investedValue + Number(totals.reserve_value ?? 0);

                  return (
                    <>
                      <div className="flex justify-between">
                        <span>NET:</span>
                        <span className="text-3xl font-semibold">{netValue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>INVESTED:</span>
                        <span>{investedValue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>RESERVE:</span>
                        <span>{Number(totals.reserve_value ?? 0).toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <PortfolioChart id={portfolio?.portfolio_id!} timeFrame="1M" />
            </div>
          )}

          <h3 className="text-lg font-semibold mb-3">My Stocks</h3>

          <div className="space-y-3">
            {holdings.map((h) => {
              const price = Number(h.stock?.current_price ?? 0);
              const qty = Number(h.quantity ?? 0);
              const total = price * qty;

              return (
                <button
                  key={h.portfolio_holding_id}
                  className="flex items-center justify-between rounded-lg border shadow-sm w-full px-4 py-3 bg-white transition-all hover:shadow-lg cursor-pointer"
                  onClick={() => handleOpenStockDetails(h.stock?.stock_id)} // ✅ FIX
                >
                  {/* Left */}
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{h.stock?.stock_symbol}</span>
                      <span className="text-xs text-gray-500">{h.stock?.name}</span>
                    </div>
                    <span className="text-sm">{price.toFixed(2)}</span>
                  </div>

                  {/* Middle */}
                  <div className="text-right">
                    <span className="font-bold">{total.toFixed(2)}</span>
                    <span className="ml-2 text-xs text-gray-500">({qty} shares)</span>
                  </div>

                  {/* Right — BUTTONS PRESERVED */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-red-600 text-red-700 hover:bg-red-50 px-3 py-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSell(h);
                      }}
                    >
                      Sell
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-green-600 text-green-700 hover:bg-green-50 px-3 py-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBuy(h);
                      }}
                    >
                      Buy
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1 text-xs"
                      onClick={() => toast.info("Transfer not implemented yet")}
                    >
                      Move
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1 text-xs"
                      onClick={() => toast.info("Bookmark not implemented yet")}
                    >
                      Bookmark
                    </button>
                  </div>
                </button>
              );
            })}

            <StockDetailsModal
              open={stockDetailsModalOpen}
              stock={selectedStock}
              onClose={() => setStockDetailsModalOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default SoloPortfolioPage;
