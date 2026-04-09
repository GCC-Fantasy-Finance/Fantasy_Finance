import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { useTradeModal } from "@/context/TradeModalContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { sellStock } from "@/hooks/sellStock";
import { invalidateCachedPortfolioView } from "@/hooks/fetchPortfolio";
import { roundShareQuantity, truncateCurrency } from "@/lib/utils";

export default function SellStockModal() {
  const { sellOpen, stock, portfolio, holdingQty, closeSell } = useTradeModal();
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<"custom" | "all">("custom");
  const [amount, setAmount] = useState<string>(""); // dollar amount when in custom mode
  const [submitting, setSubmitting] = useState(false);

  const price = Number(stock?.current_price ?? 0);
  const reserve = Number(portfolio?.reserve_value ?? 0);
  const availableShares = Number(holdingQty ?? 0);

  const parsedAmount = useMemo(() => {
    const v = Number(amount);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }, [amount]);

  // Compute quantity to sell based on mode
  const quantityToSell = useMemo(() => {
    if (mode === "all") return availableShares;
    const q = price > 0 ? parsedAmount / price : 0;
    return Number.isFinite(q) ? q : 0;
  }, [mode, parsedAmount, price, availableShares]);

  const handleAmountChange = (value: string) => {
    // Allow empty string
    if (value === "") {
      setAmount("");
      return;
    }

    // Only allow digits and single decimal point
    if (!/^\d*\.?\d*$/.test(value)) {
      return; // Reject if contains invalid characters
    }

    // Prevent multiple decimal points
    if ((value.match(/\./g) || []).length > 1) {
      return;
    }

    // Parse and validate it's a positive number
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setAmount(value);
    }
  };

  const valid = useMemo(() => {
    if (!sellOpen || !stock || !portfolio) return false;
    if (mode === "all") return availableShares > 0;
    if (parsedAmount <= 0) return false;
    if (quantityToSell <= 0) return false;
    // cannot sell more than owned (allow tiny epsilon for float div)
    return quantityToSell <= availableShares + 1e-9;
  }, [
    sellOpen,
    stock,
    portfolio,
    mode,
    parsedAmount,
    quantityToSell,
    availableShares,
  ]);

  const proceeds = useMemo(() => {
    return Number((quantityToSell * price).toFixed(2));
  }, [quantityToSell, price]);

  // ESC + outside click
  useEffect(() => {
    if (!sellOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSell();
    function onMouse(e: MouseEvent) {
      const target = e.target as Node;
      if (modalRef.current && !modalRef.current.contains(target)) closeSell();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, [sellOpen, closeSell]);

  useEffect(() => {
    if (!sellOpen) {
      setAmount("");
      setMode("custom");
      setSubmitting(false);
    }
  }, [sellOpen]);

  if (!sellOpen || !stock || !portfolio) return null;

  async function handleSell() {
    if (!user?.id) {
      toast.error("You must be signed in");
      return;
    }
    if (!valid) return;

    try {
      setSubmitting(true);
      const res = await sellStock({
        userId: user.id,
        stockId: stock!.stock_id,
        price,
        quantity: roundShareQuantity(quantityToSell),
        portfolioId: portfolio!.portfolio_id,
      });
      if (!res.success) {
        toast.error(res.message ?? "Sale failed");
      } else {
        toast.success("Sold successfully");
        closeSell();
        invalidateCachedPortfolioView();
        window.dispatchEvent(new CustomEvent("ff:trade-completed"));
      }
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

  const sellLabel = valid ? `Sell $${truncateCurrency(proceeds)}` : "Sell";

  const modal = (
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded bg-white shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="text-base font-semibold">
            Sell {stock.stock_symbol}
          </div>
          <button
            onClick={closeSell}
            className="rounded p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reserve Badge */}
        <div className="flex justify-end px-4">
          <div className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
            Reserve: ${truncateCurrency(reserve)}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-4">
          {/* Stock box */}
          <div className="mt-3 rounded border bg-white px-4 py-3 flex items-center gap-3">
            {stock.logo_url ? (
              <img
                src={stock.logo_url}
                alt={stock.stock_symbol}
                className="h-10 w-10 shrink-0 object-contain"
              />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                {stock.stock_symbol[0]}
              </div>
            )}
            <div>
              <div className="font-medium">{stock.name}</div>
              <div className="mt-1 text-green-700 font-semibold">
                ${truncateCurrency(price)} / Share
              </div>
            </div>
          </div>

          {/* Sell options */}
          <div className="mt-3 rounded border bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                id="sell-custom"
                type="radio"
                checked={mode === "custom"}
                onChange={() => setMode("custom")}
              />
              <label htmlFor="sell-custom" className="text-sm text-gray-700">
                Sell custom amount ($)
              </label>
            </div>
            {mode === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className="w-full rounded border px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input
                id="sell-all"
                type="radio"
                checked={mode === "all"}
                onChange={() => setMode("all")}
              />
              <label htmlFor="sell-all" className="text-sm text-gray-700">
                Sell All (${truncateCurrency(availableShares * price)})
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" onClick={closeSell} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSell}
              disabled={!valid || submitting}
              className="bg-red-700 hover:bg-red-800 text-white"
            >
              {submitting ? "Selling..." : sellLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
