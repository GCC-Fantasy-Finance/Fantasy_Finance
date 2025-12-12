import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { usePageTitle } from "@/hooks/usePageTitle";
import buyStock from "@/hooks/buyStock";
import { toast } from "sonner";
import { fetchPortfolioView } from "@/hooks/fetchPortfolio";

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
  };
}

function SoloPortfolioPage() {
  usePageTitle("Solo Portfolio");
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [totals, setTotals] = useState<{ total_value?: number; reserve_value?: number } | null>(null);

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    if (!auth.user) {
      setHoldings([]);
      setTotals(null);
      setLoading(false);
      return;
    }

    try {
      // Use shared fetcher for Solo portfolio
      const { portfolio, totals, holdings } = await fetchPortfolioView({ userId: auth.user.id, isSolo: true });
      if (!portfolio) {
        setHoldings([]);
        setTotals(null);
      } else {
        setTotals(totals);
        setHoldings(holdings as HoldingView[]);
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
    let mounted = true;
    loadHoldings();
    return () => {
      mounted = false;
    };
  }, [loadHoldings]);

  async function handleBuy(h: HoldingView) {
    if (!auth.user) {
      toast.error("Please sign in to buy");
      return;
    }
    if (!h.stock_id) {
      toast.error("Invalid stock");
      return;
    }

    setLoading(true);
    const res = await buyStock({ userId: auth.user.id, stockId: Number(h.stock_id), price: Number(h.stock?.current_price ?? 0), quantity: 1, isSolo: true });
    if (!res.success) {
      toast.error(res.message ?? "Buy failed");
      console.error("buyStock result:", res);
      setLoading(false);
      return;
    }

    toast.success("Bought 1 share — portfolio updated");
    // refresh data
    await loadHoldings();
  }

  // (Step 1) — only show stock symbols and current prices for now.

  return (
    <>
      {loading ? (
        <p className="text-gray-600">Loading portfolio...</p>
      ) : holdings.length === 0 ? (
        <p className="text-gray-600">No holdings yet.</p>
      ) : (
        <div>
          {/* Summary cards: NET, INVESTED, RESERVE */}
          {totals && (
            <div className="mb-6">
              <div className="rounded-lg border border-gray-300 shadow px-6 py-4 bg-white w-full max-w-sm">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-8">
                    <span className="text-sm text-gray-700">NET:</span>
                    <span className="text-3xl font-semibold tracking-wide">{Number(totals.total_value ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-8">
                    <span className="text-sm text-gray-700">INVESTED:</span>
                    <span className="text-xl font-semibold tracking-wide">
                      {(Number(totals.total_value ?? 0) - Number(totals.reserve_value ?? 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-8">
                    <span className="text-sm text-gray-700">RESERVE:</span>
                    <span className="text-xl font-semibold tracking-wide">{Number(totals.reserve_value ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <h3 className="text-lg font-semibold mb-3">My Stocks</h3>
          <div className="space-y-3">
            {holdings.map((h) => {
              const price = Number(h.stock?.current_price ?? 0);
              const qty = Number(h.quantity ?? 0);
              const total = price * qty;

              return (
                <div
                  key={h.portfolio_holding_id}
                  className="flex items-center justify-between rounded-lg border shadow-sm px-4 py-3 bg-white"
                >
                  {/* Left: Symbol and price */}
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold tracking-wide">
                        {h.stock?.stock_symbol ?? h.stock?.name}
                      </span>
                      <span className="text-xs text-gray-500">{h.stock?.name}</span>
                    </div>
                    <div className="flex items-center text-gray-700">
                      {/* Eye icon */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        className="w-4 h-4 mr-1"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12z"
                        />
                        <circle cx="12" cy="12" r="3" strokeWidth="2" />
                      </svg>
                      <span className="text-sm font-medium">{price.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Middle: Total value (black credit number) */}
                  <div className="text-right mr-3">
                    <span className="text-sm font-bold text-black">{total.toFixed(2)}</span>
                    <span className="ml-2 text-xs text-gray-500">({qty} shares)</span>
                  </div>

                  {/* Right: Button cluster */}
                  <div className="flex items-center gap-2">
                    {/* Sell (no-op) */}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-red-600 text-red-700 hover:bg-red-50 px-3 py-1 text-xs"
                      onClick={() => toast.info("Sell not implemented yet")}
                    >
                      {/* Minus icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3 h-3">
                        <path d="M5 12h14" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Sell
                    </button>

                    {/* Buy (wired to buyStock) */}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-green-600 text-green-700 hover:bg-green-50 px-3 py-1 text-xs"
                      onClick={() => handleBuy(h)}
                    >
                      {/* Plus icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3 h-3">
                        <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Buy
                    </button>

                    {/* Transfer (no-op) */}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1 text-xs"
                      onClick={() => toast.info("Transfer not implemented yet")}
                    >
                      {/* Arrow right icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3 h-3">
                        <path d="M5 12h12M13 7l5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Move
                    </button>

                    {/* Bookmark (no-op) */}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1 text-xs"
                      onClick={() => toast.info("Bookmark not implemented yet")}
                    >
                      {/* Bookmark icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3 h-3">
                        <path d="M6 4h12v16l-6-3-6 3V4z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default SoloPortfolioPage;
