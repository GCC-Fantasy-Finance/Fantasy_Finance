import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Compass } from "lucide-react";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import PortfolioChart from "@/components/ui/portfolioChart";
import { useAuth } from "@/context/AuthContext";
import { useTradeModal } from "@/context/TradeModalContext";
import {
  fetchPortfolioView,
  getCachedPortfolioView,
  type HoldingView,
  type PortfolioViewResult,
} from "@/hooks/fetchPortfolio";
import { getDraftPicksByLeague } from "@/lib/draftpicks";
import { getDraftByLeague } from "@/lib/drafts";
import { getLeagueById } from "@/lib/leagues";
import {
  calculateInvestedValue,
  calculatePortfolioValue,
} from "@/lib/portfolioValue";
import { supabase } from "@/lib/supabase";
import { getStockById, type StockRow } from "@/lib/stocks";
import PageContent from "@/layouts/components/PageContent";
import PortfolioHoldingCard from "@/features/portfolio/components/PortfolioHoldingCard";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import Ticker from "@/components/ui/ticker";

type DraftedStockItem = {
  stockId: number;
  stock: HoldingView["stock"];
};

type HoldingListItem = {
  key: string;
  holding: HoldingView;
  buyButtonLabel: "Buy" | "Buy More";
};

type PortfolioPageProps = {
  mode: "solo" | "league";
  leagueId?: string;
  wrapWithPageContent?: boolean;
};

type PortfolioSummary = {
  previous_close_value?: number;
  reserve_value?: number;
} | null;

const INITIAL_PORTFOLIO_VALUE = 10000;

import { truncateCurrency } from "@/lib/utils";

function formatCurrency(value: number) {
  return truncateCurrency(value);
}

export default function PortfolioPage({
  mode,
  leagueId,
  wrapWithPageContent = false,
}: PortfolioPageProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { openSell, openBuy } = useTradeModal();

  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [totals, setTotals] = useState<PortfolioSummary>(null);
  const [portfolio, setPortfolio] = useState<{ portfolio_id: number } | null>(
    null,
  );
  const [draftedStocks, setDraftedStocks] = useState<DraftedStockItem[]>([]);
  const [stockDetailsModalOpen, setStockDetailsModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);

  const isLeagueMode = mode === "league";

  const resetPortfolioState = useCallback(() => {
    setHoldings([]);
    setTotals(null);
    setPortfolio(null);
    setDraftedStocks([]);
  }, []);

  const applyPortfolioState = useCallback((result: PortfolioViewResult) => {
    if (!result.portfolio) {
      setHoldings([]);
      setTotals(null);
      setPortfolio(null);
      return;
    }

    setTotals(result.totals);
    setHoldings(result.holdings);
    setPortfolio({ portfolio_id: result.portfolio.portfolio_id });
  }, []);

  const loadDraftedStocks = useCallback(
    async (leagueIdAsNumber: number, portfolioId: number) => {
      const league = await getLeagueById(leagueIdAsNumber);
      const draftingEnabled = Boolean(league?.has_drafting);

      if (!draftingEnabled) {
        setDraftedStocks([]);
        return;
      }

      const draft = await getDraftByLeague(leagueIdAsNumber);
      if (!draft) {
        setDraftedStocks([]);
        return;
      }

      const picks = await getDraftPicksByLeague(leagueIdAsNumber);
      const myPickStockIds = picks
        .filter((pick) => pick.portfolio_id === portfolioId)
        .map((pick) => Number(pick.stock_id));

      const uniqueStockIds = Array.from(
        new Set(myPickStockIds.filter((stockId) => Number.isFinite(stockId))),
      );

      if (uniqueStockIds.length === 0) {
        setDraftedStocks([]);
        return;
      }

      const { data: stockRows, error } = await supabase
        .from("Stocks")
        .select("stock_id,stock_symbol,name,current_price,previous_close")
        .in("stock_id", uniqueStockIds);

      if (error) {
        console.error("Failed to load drafted stocks:", error);
        setDraftedStocks([]);
        return;
      }

      const stockById = new Map<number, HoldingView["stock"]>();
      for (const stockRow of stockRows ?? []) {
        const stockId = Number((stockRow as { stock_id: number }).stock_id);
        const currentPrice = (stockRow as { current_price?: number | null })
          .current_price;
        const previousClose = (stockRow as { previous_close?: number | null })
          .previous_close;
        stockById.set(stockId, {
          stock_id: stockId,
          stock_symbol:
            (stockRow as { stock_symbol?: string | null }).stock_symbol ?? null,
          name: (stockRow as { name?: string | null }).name ?? null,
          current_price:
            currentPrice === null || currentPrice === undefined
              ? null
              : Number(currentPrice),
          previous_close:
            previousClose === null || previousClose === undefined
              ? null
              : Number(previousClose),
        });
      }

      const seenStockIds = new Set<number>();
      const orderedDraftedStocks: DraftedStockItem[] = [];
      for (const stockId of myPickStockIds) {
        if (seenStockIds.has(stockId)) continue;
        seenStockIds.add(stockId);
        orderedDraftedStocks.push({
          stockId,
          stock: stockById.get(stockId) ?? {
            stock_id: stockId,
            stock_symbol: null,
            name: `Stock #${stockId}`,
            current_price: null,
            previous_close: null,
          },
        });
      }

      setDraftedStocks(orderedDraftedStocks);
    },
    [],
  );

  const loadHoldings = useCallback(async () => {
    if (!auth.user) {
      resetPortfolioState();
      setLoading(false);
      return;
    }

    const leagueIdAsNumber = Number(leagueId);
    if (isLeagueMode && (!leagueId || !Number.isFinite(leagueIdAsNumber))) {
      resetPortfolioState();
      setLoading(false);
      return;
    }

    const params = isLeagueMode
      ? {
          userId: auth.user.id,
          isSolo: false,
          leagueId: leagueIdAsNumber,
        }
      : {
          userId: auth.user.id,
          isSolo: true,
        };

    const useCache = !isLeagueMode;
    const cached = useCache ? getCachedPortfolioView(params) : null;

    if (cached) {
      applyPortfolioState(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const result = await fetchPortfolioView(params, {
        useCache,
        forceRefresh: Boolean(cached),
      });
      applyPortfolioState(result);

      if (isLeagueMode && result.portfolio?.portfolio_id) {
        await loadDraftedStocks(
          leagueIdAsNumber,
          result.portfolio.portfolio_id,
        );
      } else {
        setDraftedStocks([]);
      }
    } catch (err) {
      console.error("Error loading holdings:", err);
      resetPortfolioState();
    } finally {
      setLoading(false);
    }
  }, [
    auth.user,
    leagueId,
    isLeagueMode,
    applyPortfolioState,
    loadDraftedStocks,
    resetPortfolioState,
  ]);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  // Background refresh after a trade — no loading spinner
  useEffect(() => {
    const handleTradeCompleted = async () => {
      if (!auth.user) return;
      const leagueIdAsNumber = Number(leagueId);
      const params = isLeagueMode
        ? { userId: auth.user.id, isSolo: false, leagueId: leagueIdAsNumber }
        : { userId: auth.user.id, isSolo: true };
      try {
        const result = await fetchPortfolioView(params, {
          useCache: false,
          forceRefresh: true,
        });
        applyPortfolioState(result);
      } catch (err) {
        console.error("Background refresh failed:", err);
      }
    };
    window.addEventListener("ff:trade-completed", handleTradeCompleted);
    return () => {
      window.removeEventListener("ff:trade-completed", handleTradeCompleted);
    };
  }, [auth.user, leagueId, isLeagueMode, applyPortfolioState]);

  function handleBuy(holding: HoldingView) {
    if (
      !auth.user ||
      !holding.stock_id ||
      !holding.stock?.current_price ||
      !portfolio
    ) {
      toast.error("Invalid stock or portfolio");
      return;
    }

    openBuy({
      stock: {
        stock_id: holding.stock.stock_id!,
        stock_symbol: holding.stock.stock_symbol ?? "",
        name: holding.stock.name ?? "",
        current_price: Number(holding.stock.current_price ?? 0),
      },
      portfolio: {
        portfolio_id: portfolio.portfolio_id,
        reserve_value: Number(totals?.reserve_value ?? 0),
      },
    });
  }

  function handleSell(holding: HoldingView) {
    if (!auth.user || !holding.stock?.stock_id || !portfolio) {
      toast.error("Invalid stock or portfolio");
      return;
    }

    const qty = Number(holding.quantity ?? 0);
    if (qty <= 0) {
      toast.error("No shares to sell");
      return;
    }

    openSell({
      stock: {
        stock_id: holding.stock.stock_id!,
        stock_symbol: holding.stock.stock_symbol ?? "",
        name: holding.stock.name ?? "",
        current_price: Number(holding.stock.current_price ?? 0),
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
  const netValue = calculatePortfolioValue({ holdings, reserveValue });
  const rawPreviousCloseValue = Number(totals?.previous_close_value ?? 0);
  const previousCloseValue =
    rawPreviousCloseValue > 0 ? rawPreviousCloseValue : netValue;
  const allTimeBaselineValue = portfolio ? INITIAL_PORTFOLIO_VALUE : netValue;

  const hasAllocationData = investedValue + reserveValue > 0;
  const allocationChartData = hasAllocationData
    ? [
        { name: "Invested", value: investedValue, color: "#00823655" },
        { name: "Reserve", value: reserveValue, color: "#008236 " },
      ]
    : [
        { name: "Invested", value: 1, color: "#00823655" },
        { name: "Reserve", value: 0, color: "#008236 " },
      ];
  const allocationTotal = allocationChartData.reduce(
    (sum, entry) => sum + entry.value,
    0,
  );
  const investedPercent =
    allocationTotal > 0 ? (investedValue / allocationTotal) * 100 : 0;
  const reservePercent =
    allocationTotal > 0 ? (reserveValue / allocationTotal) * 100 : 0;

  const holdingListItems = useMemo<HoldingListItem[]>(() => {
    if (!isLeagueMode || draftedStocks.length === 0) {
      return holdings.map((holding) => {
        const qty = Number(holding.quantity ?? 0);
        return {
          key: `holding-${holding.portfolio_holding_id}`,
          holding,
          buyButtonLabel: qty > 0 ? "Buy More" : "Buy",
        };
      });
    }

    const holdingByStockId = new Map<number, HoldingView>();
    for (const holding of holdings) {
      const stockId = Number(holding.stock_id);
      if (Number.isFinite(stockId) && !holdingByStockId.has(stockId)) {
        holdingByStockId.set(stockId, holding);
      }
    }

    const mergedItems: HoldingListItem[] = [];
    const seenStockIds = new Set<number>();

    for (const draftedStock of draftedStocks) {
      const stockId = draftedStock.stockId;
      if (seenStockIds.has(stockId)) continue;
      seenStockIds.add(stockId);

      const existingHolding = holdingByStockId.get(stockId);
      if (existingHolding) {
        const qty = Number(existingHolding.quantity ?? 0);
        mergedItems.push({
          key: `holding-${existingHolding.portfolio_holding_id}`,
          holding: existingHolding,
          buyButtonLabel: qty > 0 ? "Buy More" : "Buy",
        });
        continue;
      }

      mergedItems.push({
        key: `drafted-${stockId}`,
        holding: {
          portfolio_holding_id: -stockId,
          portfolio_id: portfolio?.portfolio_id ?? 0,
          stock_id: stockId,
          quantity: 0,
          average_buy_price: null,
          stock: draftedStock.stock,
        },
        buyButtonLabel: "Buy",
      });
    }

    for (const holding of holdings) {
      const stockId = Number(holding.stock_id);
      if (Number.isFinite(stockId) && seenStockIds.has(stockId)) continue;
      const qty = Number(holding.quantity ?? 0);
      mergedItems.push({
        key: `holding-${holding.portfolio_holding_id}`,
        holding,
        buyButtonLabel: qty > 0 ? "Buy More" : "Buy",
      });
    }

    return mergedItems;
  }, [draftedStocks, holdings, isLeagueMode, portfolio?.portfolio_id]);

  const content = loading ? (
    <div className="flex items-center justify-center py-12 mb-8">
      <p className="text-gray-600">Loading portfolio...</p>
    </div>
  ) : (
    <div className="mb-18">
      <div className="mb-6 grid grid-cols-1 gap-6 min-[950px]:grid-cols-2">
        <div className="w-full rounded-md border border-gray-300 bg-white px-6 py-5">
          <p className="text-sm text-gray-500">TOTAL PORTFOLIO VALUE</p>

          <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-3">
            <span className="text-3xl font-medium leading-none text-gray-800">
              ${formatCurrency(netValue)}
            </span>
            <Ticker
              currentValue={netValue}
              previousValue={previousCloseValue}
              displayAs="percent"
              size="large"
              dollarAmount={true}
              background={true}
              timeFrame="1D"
            />
          </div>

          <div className="mt-6 items-center gap-5 flex flex-wrap">
            <div className="h-24 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocationChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="90%"
                    stroke="#ffffff"
                    strokeWidth={1}
                    isAnimationActive={true}
                  >
                    {allocationChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3 text-gray-800">
                <span className="h-4 w-4 text-sm rounded bg-[#00823655]" />
                <span>
                  Invested: ${formatCurrency(investedValue)}{" "}
                  <span className="text-gray-400">
                    ({investedPercent.toFixed(1)}%)
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3 text-gray-800">
                <span className="h-4 w-4 text-sm rounded bg-green-700" />
                <span>
                  Reserve: ${formatCurrency(reserveValue)}{" "}
                  <span className="text-gray-400">
                    ({reservePercent.toFixed(1)}%)
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-start gap-x-4 gap-y-3">
            <p className="text-sm text-gray-500">MORE STATS</p>
            <Ticker
              currentValue={netValue}
              previousValue={allTimeBaselineValue}
              displayAs="percent"
              size="large"
              dollarAmount={true}
              background={true}
              timeFrame="All Time"
            />
          </div>
        </div>

        {portfolio && (
          <div className="z-0">
            {/* timeframe selector */}
            <PortfolioChart id={portfolio.portfolio_id} timeFrame="1M" />
          </div>
        )}
      </div>

      <h2 className="mb-2 text-lg font-semibold">My Stocks</h2>

      <div className="">
        {holdingListItems.length === 0 ? (
          <div className="mb-4 flex justify-start">
            <button
              type="button"
              onClick={() => navigate("/discover")}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-green-700/30 px-4 py-2 text-green-700 hover:bg-green-700/10"
            >
              <Compass className="size-5 text-green-700" />
              <span className="text-base leading-none">
                No stocks yet – Discover?
              </span>
            </button>
          </div>
        ) : (
          <>
            {holdingListItems.map((item, index) => {
              return (
                <PortfolioHoldingCard
                  key={item.key}
                  holding={item.holding}
                  onOpenStockDetails={handleOpenStockDetails}
                  onSell={handleSell}
                  onBuy={handleBuy}
                  onBookmark={() => toast.info("Bookmark not implemented yet")}
                  buyButtonLabel={item.buyButtonLabel}
                  showBottomBorder={index === holdingListItems.length - 1}
                  showTopRounded={index === 0}
                  showBottomRounded={index === holdingListItems.length - 1}
                />
              );
            })}

            <div className="mt-4 mb-4 flex justify-center">
              <button
                type="button"
                onClick={() => navigate("/discover")}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-green-700/30 px-4 py-2 text-green-700 hover:bg-green-700/10"
              >
                <Compass className="size-5 text-green-700" />
                <span className="text-base leading-none">
                  Discover More Stocks
                </span>
              </button>
            </div>
          </>
        )}

        <StockDetailsModal
          open={stockDetailsModalOpen}
          stock={selectedStock}
          onClose={() => setStockDetailsModalOpen(false)}
        />
      </div>
    </div>
  );

  if (wrapWithPageContent) {
    return <PageContent>{content}</PageContent>;
  }

  return content;
}
