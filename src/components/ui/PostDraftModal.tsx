import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { buyStock } from "@/hooks/buyStock";

interface DraftedStock {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
}

interface PostDraftBuyModalProps {
  open: boolean;
  draftedStockIds: Set<number>;
  portfolioId: number;
  onClose: () => void;
}

export default function PostDraftBuyModal({
  open,
  draftedStockIds,
  portfolioId,
  onClose,
}: PostDraftBuyModalProps) {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [draftedStocks, setDraftedStocks] = useState<DraftedStock[]>([]);
  const [portfolio, setPortfolio] = useState<{
    portfolio_id: number;
    reserve_value: number;
  } | null>(null);
  const [buyAmounts, setBuyAmounts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Load drafted stocks
  useEffect(() => {
    if (!open || draftedStockIds.size === 0) {
      setDraftedStocks([]);
      return;
    }

    const loadStocks = async () => {
      const ids = Array.from(draftedStockIds);
      const { data, error } = await supabase
        .from("Stocks")
        .select("stock_id, stock_symbol, name, current_price")
        .in("stock_id", ids);

      if (error) {
        console.error("Error loading drafted stocks:", error);
        return;
      }

      setDraftedStocks(data ?? []);
      // Initialize buy amounts
      const initialAmounts: Record<number, string> = {};
      data?.forEach(stock => {
        initialAmounts[stock.stock_id] = "";
      });
      setBuyAmounts(initialAmounts);
    };

    loadStocks();
  }, [open, draftedStockIds]);

  // Load portfolio reserve
  useEffect(() => {
    if (!open || !portfolioId) {
      setPortfolio(null);
      return;
    }

    const loadPortfolio = async () => {
      const { data, error } = await supabase
        .from("Portfolios")
        .select("portfolio_id, reserve_value")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();

      if (error) {
        console.error("Error loading portfolio:", error);
        return;
      }

      setPortfolio(data);
    };

    loadPortfolio();
  }, [open, portfolioId]);

  // ESC + outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    function onMouse(e: MouseEvent) {
      const target = e.target as Node;
      if (modalRef.current && !modalRef.current.contains(target)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, [open, onClose]);

  const handleAmountChange = (stockId: number, value: string) => {
    // Only allow valid numbers (no letters, no negative signs)
    if (value === "") {
      setBuyAmounts(prev => ({ ...prev, [stockId]: "" }));
      return;
    }

    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setBuyAmounts(prev => ({ ...prev, [stockId]: value }));
    }
  };

  // Calculate total cost
  const totalCost = Object.entries(buyAmounts).reduce((sum, [, amount]) => {
    const amountNum = parseFloat(amount) || 0;
    return sum + amountNum;
  }, 0);

  // Check if any amount is entered
  const hasAnyAmount = Object.values(buyAmounts).some(val => parseFloat(val) || 0 > 0);

  // Check if sufficient reserve
  const canBuy = hasAnyAmount && portfolio && totalCost <= portfolio.reserve_value && !submitting;

  const handleSplitEvenly = () => {
    if (!portfolio || draftedStocks.length === 0) return;

    const amountPerStock = portfolio.reserve_value / draftedStocks.length;
    const newAmounts: Record<number, string> = {};

    draftedStocks.forEach(stock => {
      newAmounts[stock.stock_id] = amountPerStock.toFixed(2);
    });

    setBuyAmounts(newAmounts);
  };

  const handleBuyAllStocks = async () => {
    if (!user?.id || !portfolio || !canBuy) {
      toast.error("Invalid purchase");
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const stock of draftedStocks) {
        const amountStr = buyAmounts[stock.stock_id];
        const amount = parseFloat(amountStr) || 0;

        if (amount <= 0) continue;

        const quantity = Number((amount / stock.current_price).toFixed(6));

        const res = await buyStock({
          userId: user.id,
          stockId: stock.stock_id,
          price: stock.current_price,
          quantity,
          portfolioId: portfolio.portfolio_id,
        });

        if (res.success) {
          successCount++;
        } else {
          errorCount++;
          toast.error(`Failed to buy ${stock.stock_symbol}: ${res.message}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully purchased ${successCount} stock(s)`);
        setTimeout(() => window.location.reload(), 300);
      }

      if (errorCount > 0) {
        toast.error(`${errorCount} purchase(s) failed`);
      }
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || draftedStocks.length === 0) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl rounded bg-white shadow-lg max-h-[80vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b px-4 pt-4 pb-3">
          <div>
            <div className="text-lg font-semibold text-green-700">Draft has ended!</div>
            <div className="text-sm text-gray-600 mt-1">Buy your drafted stocks below</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded p-1 text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {portfolio && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSplitEvenly}
                  variant="outline"
                  className="text-xs py-1 h-auto"
                  disabled={submitting}
                >
                  Split Evenly
                </Button>
                <div className="rounded-full bg-green-100 px-3 py-1">
                  <span className="text-sm font-medium text-green-800">
                    Reserve: ${portfolio.reserve_value.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <div className="space-y-3">
            {draftedStocks.map(stock => (
              <div
                key={stock.stock_id}
                className="rounded border bg-gray-50 px-4 py-3 hover:bg-gray-100 transition"
              >
                <div className="flex items-end justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{stock.name}</div>
                    <div className="text-sm text-gray-600">{stock.stock_symbol}</div>
                  </div>
                  <div className="text-right mr-4">
                    <div className="text-xs text-gray-600 mb-1">Price</div>
                    <div className="font-semibold text-green-700">
                      ${stock.current_price.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex flex-col items-start">
                    <label className="text-xs font-medium text-gray-700 mb-1">Amount ($)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={buyAmounts[stock.stock_id]}
                      onChange={(e) => handleAmountChange(stock.stock_id, e.target.value)}
                      placeholder="0.00"
                      className="w-24 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Cost Summary */}
          {hasAnyAmount && (
            <div className="mt-4 p-3 bg-green-50 rounded border border-green-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-900">Total Cost:</span>
                <span className="text-lg font-semibold text-green-900">${totalCost.toFixed(2)}</span>
              </div>
              {portfolio && (
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-green-800">Remaining Reserve:</span>
                  <span
                    className={`text-sm font-medium ${
                      portfolio.reserve_value - totalCost >= 0
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    ${(portfolio.reserve_value - totalCost).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t bg-white px-4 py-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            No Thanks
          </Button>
          <Button
            onClick={handleBuyAllStocks}
            disabled={!canBuy}
            className="bg-green-700 hover:bg-green-800 text-white disabled:bg-gray-300"
          >
            {submitting ? "Purchasing..." : "Buy Stocks"}
          </Button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}