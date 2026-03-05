import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "./button";
import { useTradeModal } from "@/context/TradeModalContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { sellStock } from "@/hooks/sellStock";

export default function SellStockModal() {
  const { sellOpen, stock, portfolio, holdingQty, closeSell } = useTradeModal();
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<"custom" | "all">("all");
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
      setMode("all");
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
        quantity: Number(quantityToSell.toFixed(6)),
        portfolioId: portfolio!.portfolio_id,
      });
      if (!res.success) {
        toast.error(res.message ?? "Sale failed");
      } else {
        toast.success("Sold successfully");
        closeSell();
        setTimeout(() => window.location.reload(), 300);
      }
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

  const step = 1; // $1 increments for custom amount
  const onStepUp = () =>
    setAmount((prev) => {
      const v = Number(prev) || 0;
      return String(v + step);
    });
  const onStepDown = () =>
    setAmount((prev) => {
      const v = Number(prev) || 0;
      return String(Math.max(0, v - step));
    });

  const sellLabel = valid ? `Sell $${proceeds.toFixed(2)}` : "Sell";

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
            Reserve: ${reserve.toFixed(2)}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-4">
          {/* Stock box */}
          <div className="mt-3 rounded border bg-white px-4 py-3">
            <div className="font-medium">{stock.name}</div>
            <div className="mt-1 text-green-700 font-semibold">
              ${price.toFixed(2)}
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
                Sell custom amt.
              </label>
            </div>
            {mode === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className="w-full rounded border px-3 py-2 text-sm"
                />
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={onStepUp}
                    className="border rounded-t px-2 py-1 bg-white hover:bg-gray-50"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onStepDown}
                    className="border rounded-b px-2 py-1 bg-white hover:bg-gray-50"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
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
                Sell All (${(availableShares * price).toFixed(2)})
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
