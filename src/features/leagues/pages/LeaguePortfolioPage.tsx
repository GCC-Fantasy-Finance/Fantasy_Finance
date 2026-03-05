import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { toast } from "sonner";
import { fetchPortfolioView } from "@/hooks/fetchPortfolio";
import { useTradeModal } from "@/context/TradeModalContext";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import PortfolioChart from "@/components/ui/portfolioChart";
import { getStockById } from "@/lib/stocks";
import { getLeagueById } from "@/lib/leagues";
import { getDraftByLeague } from "@/lib/drafts";
import { getDraftPicksByLeague } from "@/lib/draftpicks";
import { supabase } from "@/lib/supabase";
import PageContent from "@/layouts/components/PageContent";
import { calculateStockPercentChange } from "@/lib/utils";
import {
  calculateInvestedValue,
  calculatePortfolioValue,
} from "@/lib/portfolioValue";

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

type DraftedStockItem = {
  stockId: number;
  label: string;
};

export default function LeaguePortfolioPage() {
  usePageTitle("League Portfolio");

  const { leagueId } = useParams<{ leagueId: string }>();
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [totals, setTotals] = useState<{
    previous_close_value?: number;
    reserve_value?: number;
  } | null>(null);
  const [hasDrafting, setHasDrafting] = useState(false);
  const [draftedStocks, setDraftedStocks] = useState<DraftedStockItem[]>([]);
  const [portfolio, setPortfolio] = useState<{ portfolio_id: number } | null>(
    null,
  );
  const { openSell, openBuy } = useTradeModal();

  const [stockDetailsModalOpen, setStockDetailsModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const loadHoldings = useCallback(async () => {
    setLoading(true);

    if (!auth.user || !leagueId) {
      setHoldings([]);
      setTotals(null);
      setHasDrafting(false);
      setDraftedStocks([]);
      setPortfolio(null);
      setLoading(false);
      return;
    }

    const leagueIdAsNumber = Number(leagueId);
    if (!Number.isFinite(leagueIdAsNumber)) {
      setHoldings([]);
      setTotals(null);
      setHasDrafting(false);
      setDraftedStocks([]);
      setPortfolio(null);
      setLoading(false);
      return;
    }

    try {
      const {
        portfolio: pf,
        totals,
        holdings,
      } = await fetchPortfolioView({
        userId: auth.user.id,
        isSolo: false,
        leagueId: leagueIdAsNumber,
      });

      if (!pf) {
        setHoldings([]);
        setTotals(null);
        setHasDrafting(false);
        setDraftedStocks([]);
        setPortfolio(null);
      } else {
        setTotals(totals);
        setHoldings(holdings as HoldingView[]);
        setPortfolio({ portfolio_id: pf.portfolio_id });

        const league = await getLeagueById(leagueIdAsNumber);
        const draftingEnabled = Boolean(league?.has_drafting);
        setHasDrafting(draftingEnabled);

        if (draftingEnabled) {
          const draft = await getDraftByLeague(leagueIdAsNumber);

          if (!draft) {
            setDraftedStocks([]);
          } else {
            const picks = await getDraftPicksByLeague(leagueIdAsNumber);
            const myPickStockIds = picks
              .filter((pick) => pick.portfolio_id === pf.portfolio_id)
              .map((pick) => Number(pick.stock_id));

            const uniqueStockIds = Array.from(
              new Set(
                myPickStockIds.filter((stockId) => Number.isFinite(stockId)),
              ),
            );

            if (uniqueStockIds.length === 0) {
              setDraftedStocks([]);
            } else {
              const { data: stockRows, error: stockRowsError } = await supabase
                .from("Stocks")
                .select("stock_id,name,stock_symbol")
                .in("stock_id", uniqueStockIds);

              if (stockRowsError) {
                console.error(
                  "Failed to load drafted stock names:",
                  stockRowsError,
                );
                setDraftedStocks([]);
              } else {
                const stockNameById = new Map<number, string>();
                for (const stockRow of stockRows ?? []) {
                  const stockId = Number(
                    (stockRow as { stock_id: number }).stock_id,
                  );
                  const stockName =
                    (stockRow as { name?: string | null }).name?.trim() ||
                    `Stock #${stockId}`;
                  const stockSymbol =
                    (
                      stockRow as { stock_symbol?: string | null }
                    ).stock_symbol?.trim() || "";

                  stockNameById.set(
                    stockId,
                    stockSymbol ? `${stockSymbol} — ${stockName}` : stockName,
                  );
                }

                const seenStockIds = new Set<number>();
                const orderedDraftedStocks: DraftedStockItem[] = [];

                for (const stockId of myPickStockIds) {
                  if (seenStockIds.has(stockId)) continue;
                  seenStockIds.add(stockId);
                  orderedDraftedStocks.push({
                    stockId,
                    label: stockNameById.get(stockId) ?? `Stock #${stockId}`,
                  });
                }

                setDraftedStocks(orderedDraftedStocks);
              }
            }
          }
        } else {
          setDraftedStocks([]);
        }
      }
    } catch (err) {
      console.error("Error loading league holdings:", err);
      setHoldings([]);
      setTotals(null);
      setHasDrafting(false);
      setDraftedStocks([]);
      setPortfolio(null);
    } finally {
      setLoading(false);
    }
  }, [auth.user, leagueId]);

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

  const reserveValue = Number(totals?.reserve_value ?? 0);
  const investedValue = calculateInvestedValue(holdings);
  const netValue = calculatePortfolioValue({
    holdings,
    reserveValue,
  });

  return (
    <PageContent>
      {loading ? (
        <p className="text-gray-600">Loading portfolio...</p>
      ) : (
        <div>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-gray-300 shadow px-6 py-4 bg-white w-full h-40 max-w-sm">
              <div className="flex justify-between">
                <span>NET:</span>
                <span className="text-3xl font-semibold">
                  ${netValue.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>INVESTED:</span>
                <span>${investedValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>RESERVE:</span>
                <span>${reserveValue.toFixed(2)}</span>
              </div>
            </div>

            {portfolio && (
              <PortfolioChart id={portfolio.portfolio_id} timeFrame="1M" />
            )}
          </div>

          {hasDrafting && (
            <div className="mb-6 rounded-lg border border-gray-300 bg-white px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Drafted Stocks
              </h3>
              {draftedStocks.length === 0 ? (
                <p className="text-sm text-gray-600">No drafted stocks yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {draftedStocks.map((stock) => (
                    <button
                      key={stock.stockId}
                      type="button"
                      onClick={() => handleOpenStockDetails(stock.stockId)}
                      className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 cursor-pointer"
                    >
                      {stock.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <h3 className="text-lg font-semibold mb-3">My Stocks</h3>

          <div className="space-y-3">
            {holdings.length === 0 ? (
              <p className="text-sm text-gray-600">No holdings yet.</p>
            ) : (
              holdings.map((h) => {
                const price = Number(h.stock?.current_price ?? 0);
                const percentChange = calculateStockPercentChange(
                  h.stock?.current_price,
                  h.stock?.previous_close,
                );
                const qty = Number(h.quantity ?? 0);
                const total = price * qty;

                return (
                  <button
                    key={h.portfolio_holding_id}
                    className="flex items-center justify-between rounded-lg border shadow-sm w-full px-4 py-3 bg-white transition-all hover:shadow-lg cursor-pointer"
                    onClick={() => handleOpenStockDetails(h.stock?.stock_id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col min-w-[120px]">
                        <span className="text-sm font-semibold">
                          {h.stock?.stock_symbol}
                        </span>
                        <span className="text-xs text-gray-500">
                          {h.stock?.name}
                        </span>
                      </div>
                      <div className="flex flex-col items-end min-w-24">
                        <span className="text-sm">${price.toFixed(2)}</span>
                        <span
                          className={`text-xs font-medium ${
                            percentChange < 0
                              ? "text-red-700"
                              : percentChange > 0
                                ? "text-green-700"
                                : "text-gray-700"
                          }`}
                        >
                          {percentChange > 0 ? "+" : ""}
                          {percentChange.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-bold">${total.toFixed(2)}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        ({qty} shares)
                      </span>
                    </div>

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
                        onClick={() =>
                          toast.info("Transfer not implemented yet")
                        }
                      >
                        Move
                      </button>

                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1 text-xs"
                        onClick={() =>
                          toast.info("Bookmark not implemented yet")
                        }
                      >
                        Bookmark
                      </button>
                    </div>
                  </button>
                );
              })
            )}

            <StockDetailsModal
              open={stockDetailsModalOpen}
              stock={selectedStock}
              onClose={() => setStockDetailsModalOpen(false)}
            />
          </div>
        </div>
      )}
    </PageContent>
  );
}
