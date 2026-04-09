import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { X, MoreVertical } from "lucide-react";

import {
  fetchPortfolioHoldingsWithStocks,
  type HoldingView,
} from "@/hooks/fetchPortfolio";
import {
  calculateInvestedValue,
  calculatePortfolioValue,
} from "@/lib/portfolioValue";
import { calculateStockPercentChange, truncateCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import StockDetailsModal from "./stockDetailsModal";
import ReportUserModal from "./ReportUserModal";
import { kickMember } from "./kickMember";
import UserBadgeHover from "./UserBadgeHover";
import type { UserBadgeView } from "@/lib/userBadges";
import { getDraftPicksByLeague } from "@/lib/draftpicks";
import { getStockById, type StockRow } from "@/lib/stocks";

type Props = {
  open: boolean;
  portfolioId: number | null;
  memberName?: string;
  memberAvatarUrl?: string;
  memberUserId?: string;
  leagueId?: string | number;
  leagueOwnerId?: string;
  isLeagueOwner?: boolean;
  badges?: UserBadgeView[];
  joinedDate?: string;
  fallbackNetValue?: number;
  leagueFinished?: boolean;
  onClose: () => void;
};

type PortfolioTotalsRow = {
  reserve_value: number | null;
};

type DraftedStockInfo = {
  stock_id: number;
  stock_symbol: string;
  name: string;
  logo_url?: string | null;
};

export default function MemberPortfolioModal({
  open,
  portfolioId,
  memberName,
  memberAvatarUrl,
  memberUserId,
  leagueId,
  leagueOwnerId,
  isLeagueOwner,
  badges,
  joinedDate,
  fallbackNetValue,
  leagueFinished,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [reserveValue, setReserveValue] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [draftedStocks, setDraftedStocks] = useState<DraftedStockInfo[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
        } else {
          onClose();
        }
      }
    };

    const handleClickOutside = () => {
      setMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [open, onClose, menuOpen]);

  useEffect(() => {
    if (!open || portfolioId == null) {
      setHoldings([]);
      setReserveValue(0);
      setDraftedStocks([]);
      setSelectedStock(null);
      setError(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadPortfolio = async () => {
      setLoading(true);
      setError(null);

      try {
        if (leagueFinished && leagueId) {
          // Finished league: only load drafted stocks
          const numericLeagueId =
            typeof leagueId === "number" ? leagueId : Number(leagueId);
          if (!Number.isFinite(numericLeagueId)) {
            throw new Error("Invalid league id.");
          }

          const picks = await getDraftPicksByLeague(numericLeagueId);
          const myPickStockIds = picks
            .filter((p) => p.portfolio_id === portfolioId)
            .map((p) => p.stock_id);
          const uniqueIds = Array.from(new Set(myPickStockIds));

          if (uniqueIds.length > 0) {
            const { data: stockRows } = await supabase
              .from("Stocks")
              .select("stock_id, stock_symbol, name, logo_url")
              .in("stock_id", uniqueIds);

            if (mounted) {
              setDraftedStocks(
                (stockRows ?? []).map((s: any) => ({
                  stock_id: s.stock_id,
                  stock_symbol: s.stock_symbol ?? "—",
                  name: s.name ?? "Unknown",
                  logo_url: s.logo_url ?? null,
                }))
              );
            }
          }
        } else {
          // Active league: load full portfolio details
          const [{ data: totalsRow, error: totalsError }, holdingsResult] =
            await Promise.all([
              supabase
                .from("Portfolios")
                .select("reserve_value")
                .eq("portfolio_id", portfolioId)
                .maybeSingle<PortfolioTotalsRow>(),
              fetchPortfolioHoldingsWithStocks(portfolioId),
            ]);

          if (totalsError) throw totalsError;
          if (holdingsResult.error) throw new Error(holdingsResult.error);

          if (!mounted) return;

          setReserveValue(Number(totalsRow?.reserve_value ?? 0));
          setHoldings(holdingsResult.holdings);
        }
      } catch (err) {
        if (!mounted) return;
        setError(
          err instanceof Error ? err.message : "Failed to load portfolio.",
        );
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
  }, [open, portfolioId, leagueFinished, leagueId]);

  const investedValue = useMemo(
    () => calculateInvestedValue(holdings),
    [holdings],
  );
  const computedNetValue = useMemo(
    () => calculatePortfolioValue({ holdings, reserveValue }),
    [holdings, reserveValue],
  );
  const netValue =
    computedNetValue > 0 ? computedNetValue : Number(fallbackNetValue ?? 0);
  const canKickMember =
    Boolean(isLeagueOwner) &&
    Boolean(memberUserId) &&
    memberUserId !== leagueOwnerId &&
    !leagueFinished;

  const handleReportUser = () => {
    setReportModalOpen(true);
    setMenuOpen(false);
  };

  const handleOpenStockDetails = async (stockId?: number | null) => {
    const numericStockId = Number(stockId);
    if (!Number.isFinite(numericStockId)) return;

    const stock = await getStockById(numericStockId);
    if (!stock) return;

    setSelectedStock(stock);
  };

  const handleKickMember = async () => {
    if (!canKickMember) return;
    if (!memberUserId) return;
    
    const success = await kickMember(
      memberUserId,
      String(leagueId ?? ""),
      Boolean(isLeagueOwner),
      leagueOwnerId,
    );
    if (success) {
      setMenuOpen(false);
      onClose();
    }
  };

  if (!open || portfolioId == null) return null;
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onMouseDown={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[95vw] max-w-3xl rounded bg-white p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {memberUserId && memberUserId !== user?.id && (
            <div className="relative">
              <button
                type="button"
                aria-label="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="p-1 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {menuOpen && (
                <div 
                  className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-10"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={handleReportUser}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded cursor-pointer"
                  >
                    Report User
                  </button>
                  {canKickMember && (
                    <button
                      type="button"
                      onClick={handleKickMember}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      Kick User
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
            username={memberName ?? "League Member"}
            avatarUrl={memberAvatarUrl}
            badges={badges}
            joinedDate={joinedDate}
          />
        </div>

        {loading ? (
          <p className="text-gray-600">Loading portfolio...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : leagueFinished ? (
          <>
            <div className="mb-5">
              <div className="rounded-lg border px-4 py-3 inline-block">
                <p className="text-xs text-gray-500">FINAL NET VALUE</p>
                <p className="text-lg font-semibold">
                  ${truncateCurrency(Number(fallbackNetValue ?? 0))}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Drafted Stocks</h3>
              {draftedStocks.length === 0 ? (
                <p className="text-sm text-gray-500">No stocks were drafted.</p>
              ) : (
                <div className="space-y-2">
                  {draftedStocks.map((stock) => (
                    <div
                      key={stock.stock_id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 bg-white transition-colors hover:bg-gray-50"
                      onClick={() => void handleOpenStockDetails(stock.stock_id)}
                    >
                      {stock.logo_url ? (
                        <img
                          src={stock.logo_url}
                          alt={stock.stock_symbol}
                          className="h-8 w-8 shrink-0 object-contain"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-gray-200 text-xs text-gray-500">
                          {stock.stock_symbol[0]}
                        </div>
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-semibold">{stock.stock_symbol}</span>
                        <span className="truncate text-xs text-gray-500">{stock.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">NET</p>
                <p className="text-lg font-semibold">${truncateCurrency(netValue)}</p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">INVESTED</p>
                <p className="text-lg font-semibold">
                  ${truncateCurrency(investedValue)}
                </p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs text-gray-500">RESERVE</p>
                <p className="text-lg font-semibold">
                  ${truncateCurrency(reserveValue)}
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
                      className="flex w-full cursor-pointer items-center justify-between rounded-lg border bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
                      onClick={() => void handleOpenStockDetails(holding.stock?.stock_id)}
                    >
                      <div className="flex items-center gap-3">
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
                        <div className="flex min-w-[120px] flex-col">
                          <span className="text-sm font-semibold">
                            {holding.stock?.stock_symbol ?? "—"}
                          </span>
                          <span className="truncate text-xs text-gray-500">
                            {holding.stock?.name ?? "Unknown stock"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end min-w-24">
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
                        <span className="font-bold">${truncateCurrency(value)}</span>
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

      <ReportUserModal
        open={reportModalOpen}
        userName={memberName}
        reportedUserId={memberUserId}
        onClose={() => setReportModalOpen(false)}
      />

      <StockDetailsModal
        open={Boolean(selectedStock)}
        stock={selectedStock}
        onClose={() => setSelectedStock(null)}
      />
    </div>,
    document.body,
  );
}
