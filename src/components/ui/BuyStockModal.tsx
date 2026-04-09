import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { useTradeModal } from "@/context/TradeModalContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { buyStock } from "@/hooks/buyStock";
import { invalidateCachedPortfolioView } from "@/hooks/fetchPortfolio";
import { truncateCurrency } from "@/lib/utils";

export default function BuyStockModal() {
  const { buyOpen, stock, portfolio, closeBuy } = useTradeModal();
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const price = Number(stock?.current_price ?? 0);
  const reserve = Number(portfolio?.reserve_value ?? 0);

  const parsedAmount = useMemo(() => {
    const v = Number(amount);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }, [amount]);

  const canBuy =
    buyOpen && price > 0 && parsedAmount > 0 && parsedAmount <= reserve;

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

  // ESC + outside click
  useEffect(() => {
    if (!buyOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBuy();
    function onMouse(e: MouseEvent) {
      const target = e.target as Node;
      if (modalRef.current && !modalRef.current.contains(target)) closeBuy();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, [buyOpen, closeBuy]);

  useEffect(() => {
    if (!buyOpen) {
      setAmount("");
      setSubmitting(false);
    }
  }, [buyOpen]);

  if (!buyOpen || !stock || !portfolio) return null;

  async function handleBuy() {
    if (!user?.id) {
      toast.error("You must be signed in");
      return;
    }
    if (!canBuy) return;

    try {
      setSubmitting(true);
      const quantity = Number((parsedAmount / price).toFixed(6));
      const res = await buyStock({
        stockId: stock!.stock_id,
        price,
        quantity,
        portfolioId: portfolio!.portfolio_id,
      });
      if (!res.success) {
        toast.error(res.message ?? "Purchase failed");
      } else {
        toast.success("Purchased successfully");
        closeBuy();
        invalidateCachedPortfolioView();
        window.dispatchEvent(new CustomEvent("ff:trade-completed"));
      }
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

  const buyLabel = canBuy ? `Buy $${truncateCurrency(parsedAmount)}` : "Buy";

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
            Buy {stock.stock_symbol}
          </div>
          <button
            onClick={closeBuy}
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
          <div className="mt-3 rounded border bg-white px-4 py-3">
            <div className="font-medium">{stock.name}</div>
            <div className="mt-1 text-green-700 font-semibold">
              ${truncateCurrency(price)}
            </div>
          </div>

          {/* Amount box */}
          <div className="mt-3 rounded border bg-gray-50 px-4 py-3">
            <div className="text-sm text-gray-700">Amount to buy ($)</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" onClick={closeBuy} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleBuy}
              disabled={!canBuy || submitting}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              {submitting ? "Buying..." : buyLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
