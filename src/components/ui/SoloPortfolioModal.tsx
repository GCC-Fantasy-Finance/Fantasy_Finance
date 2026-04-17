import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";

import {
  fetchPortfolioHoldingsWithStocks,
  type HoldingView,
} from "@/hooks/fetchPortfolio";
import {
  calculateInvestedValue,
  calculatePortfolioValue,
} from "@/lib/portfolioValue";
import { calculateStockPercentChange, truncateCurrency } from "@/lib/utils";
import UserBadgeHover from "./UserBadgeHover";
import StockDetailsModal from "./stockDetailsModal";
import type { UserBadgeView } from "@/lib/userBadges";

type Props = {
  open: boolean;
  portfolioId: number | null;
  memberName?: string;
  memberAvatarUrl?: string;
  badges?: UserBadgeView[];
  joinedDate?: string;
  fallbackNetValue?: number;
  onClose: () => void;
};

type PortfolioTotalsRow = {
  reserve_value: number | null;
};

export default function SoloPortfolioModal({
  open,
  portfolioId,
  memberName = "Unknown User",
  memberAvatarUrl,
  badges = [],
  joinedDate,
  fallbackNetValue,
  onClose,
}: Props) {
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [reserve, setReserve] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<HoldingView | null>(null);

  useEffect(() => {
    if (!open || !portfolioId) {
      setHoldings([]);
      return;
    }

    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const holdingsResult = await fetchPortfolioHoldingsWithStocks(
          portfolioId,
        );

        if (!mounted) return;

        if ("holdings" in holdingsResult) {
          setHoldings(holdingsResult.holdings);
        }

        const totalsResponse = await fetch(
          `/api/portfolio-totals?portfolio_id=${portfolioId}`,
        );
        const totalsData = (await totalsResponse.json()) as {
          data?: PortfolioTotalsRow[];
        };

        if (!mounted) return;

        if (totalsData.data?.[0]) {
          setReserve(Number(totalsData.data[0].reserve_value ?? 0));
        }
      } catch (err) {
        console.error("Error loading portfolio:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [open, portfolioId]);

  const stats = useMemo(() => {
    if (!holdings.length && fallbackNetValue !== undefined) {
      return {
        totalValue: fallbackNetValue,
        investedValue: fallbackNetValue,
        reserveValue: reserve,
        gainLoss: fallbackNetValue - 10000,
        gainLossPercent: ((fallbackNetValue - 10000) / 10000) * 100,
      };
    }

    const investedValue = calculateInvestedValue(holdings);
    const totalValue = calculatePortfolioValue({
      netValue: investedValue + reserve,
    });
    const gainLoss = totalValue - 10000;
    const gainLossPercent = (gainLoss / 10000) * 100;

    return {
      totalValue,
      investedValue,
      reserveValue: reserve,
      gainLoss,
      gainLossPercent,
    };
  }, [holdings, reserve, fallbackNetValue]);

  // ESC key handler
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedStock) {
          setSelectedStock(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, selectedStock, onClose]);

  if (!open || portfolioId == null) return null;
  if (typeof document === "undefined") return null;

  const content = (
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onMouseDown={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[95vw] max-w-3xl rounded bg-white p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-5 flex items-center gap-3 pr-12">
          <UserBadgeHover
            username={memberName ?? "Unknown User"}
            avatarUrl={memberAvatarUrl}
            badges={badges}
            joinedDate={joinedDate}
          />
        </div>

        {loading ? (
          <p className="text-gray-600">Loading portfolio...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">NET</p>
                <p className="text-lg font-semibold">
                  ${truncateCurrency(stats.totalValue)}
                </p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">INVESTED</p>
                <p className="text-lg font-semibold">
                  ${truncateCurrency(stats.investedValue)}
                </p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">RESERVE</p>
                <p className="text-lg font-semibold">
                  ${truncateCurrency(stats.reserveValue)}
                </p>
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto space-y-3">
              {holdings.length === 0 ? (
                <div className="border rounded-lg px-4 py-6 text-center text-gray-500">
                  No holdings yet.
                </div>
              ) : (
                holdings.map((holding) => {
                  const quantity = Number(holding.quantity ?? 0);
                  const currentPrice = Number(
                    holding.stock?.current_price ?? 0,
                  );
                  const value = quantity * currentPrice;
                  const percentChange = calculateStockPercentChange(
                    holding.stock?.current_price,
                    holding.stock?.previous_close,
                  );

                  return (
                    <div
                      key={holding.portfolio_holding_id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border shadow-sm w-full px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setSelectedStock(holding)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {holding.stock?.logo_url ? (
                          <img
                            src={holding.stock.logo_url}
                            alt={holding.stock?.stock_symbol ?? ""}
                            className="h-8 w-8 shrink-0 object-contain"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-gray-200 text-xs text-gray-500">
                            {holding.stock?.stock_symbol?.[0] ?? "—"}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0 sm:min-w-[120px]">
                          <span className="text-sm font-semibold">
                            {holding.stock?.stock_symbol ?? "—"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {holding.stock?.name ?? "Unknown stock"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end sm:min-w-24">
                          <span className="text-sm">
                            ${truncateCurrency(currentPrice)}
                          </span>
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
                        <span className="font-bold">
                          ${truncateCurrency(value)}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          ({quantity} shares)
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {ReactDOM.createPortal(content, document.body)}
      <StockDetailsModal
        open={!!selectedStock}
        stock={(selectedStock?.stock as any) ?? null}
        onClose={() => setSelectedStock(null)}
      />
    </>
  );
}
