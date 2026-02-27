import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";

import { fetchPortfolioHoldingsWithStocks, type HoldingView } from "@/hooks/fetchPortfolio";
import { calculateInvestedValue, calculatePortfolioValue } from "@/lib/portfolioValue";
import { calculateStockPercentChange } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  portfolioId: number | null;
  memberName?: string;
  memberAvatarUrl?: string;
  fallbackNetValue?: number;
  onClose: () => void;
};

type PortfolioTotalsRow = {
  reserve_value: number | null;
};

export default function LeagueMemberPortfolioModal({
  open,
  portfolioId,
  memberName,
  memberAvatarUrl,
  fallbackNetValue,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [reserveValue, setReserveValue] = useState(0);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || portfolioId == null) {
      setHoldings([]);
      setReserveValue(0);
      setError(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadPortfolio = async () => {
      setLoading(true);
      setError(null);

      try {
        const [{ data: totalsRow, error: totalsError }, holdingsResult] = await Promise.all([
          supabase
            .from("Portfolios")
            .select("reserve_value")
            .eq("portfolio_id", portfolioId)
            .maybeSingle<PortfolioTotalsRow>(),
          fetchPortfolioHoldingsWithStocks(portfolioId),
        ]);

        if (totalsError) {
          throw totalsError;
        }

        if (holdingsResult.error) {
          throw new Error(holdingsResult.error);
        }

        if (!mounted) return;

        setReserveValue(Number(totalsRow?.reserve_value ?? 0));
        setHoldings(holdingsResult.holdings);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load portfolio.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPortfolio();

    return () => {
      mounted = false;
    };
  }, [open, portfolioId]);

  const investedValue = useMemo(() => calculateInvestedValue(holdings), [holdings]);
  const computedNetValue = useMemo(
    () => calculatePortfolioValue({ holdings, reserveValue }),
    [holdings, reserveValue]
  );
  const netValue = computedNetValue > 0 ? computedNetValue : Number(fallbackNetValue ?? 0);

  if (!open || portfolioId == null) return null;
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onMouseDown={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[95vw] max-w-3xl rounded bg-white p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-8">
          {memberAvatarUrl ? (
            <img
              src={memberAvatarUrl}
              alt={memberName ?? "League member"}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-base select-none">
              {(memberName?.[0] ?? "U").toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold">{memberName ?? "League Member"}</h2>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-600">Loading portfolio...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">NET</p>
                <p className="text-lg font-semibold">${netValue.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">INVESTED</p>
                <p className="text-lg font-semibold">${investedValue.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">RESERVE</p>
                <p className="text-lg font-semibold">${reserveValue.toFixed(2)}</p>
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
                  const currentPrice = Number(holding.stock?.current_price ?? 0);
                  const value = quantity * currentPrice;
                  const percentChange = calculateStockPercentChange(
                    holding.stock?.current_price,
                    holding.stock?.previous_close
                  );

                  return (
                    <div
                      key={holding.portfolio_holding_id}
                      className="flex items-center justify-between rounded-lg border shadow-sm w-full px-4 py-3 bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col min-w-[120px]">
                          <span className="text-sm font-semibold">
                            {holding.stock?.stock_symbol ?? "—"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {holding.stock?.name ?? "Unknown stock"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end min-w-[96px]">
                          <span className="text-sm">${currentPrice.toFixed(2)}</span>
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
                        <span className="font-bold">${value.toFixed(2)}</span>
                        <span className="ml-2 text-xs text-gray-500">({quantity} shares)</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}