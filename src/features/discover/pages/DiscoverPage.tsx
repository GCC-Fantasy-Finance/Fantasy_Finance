import { usePageTitle } from "@/hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useStock } from "@/hooks/useStock";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { buyStock } from "@/hooks/buyStock";

function Discover() {
  usePageTitle("Discover");
  const { stock, loading, error } = useStock("GOOG");
  const { user, loading: authLoading } = useAuth();
  const [buying, setBuying] = useState(false);

  async function handleBuy() {
    if (!stock) return;
    if (authLoading) {
      toast.error("Auth still loading; please wait.");
      return;
    }
    if (!user) {
      toast.error("Please sign in to buy.");
      return;
    }

    setBuying(true);
    try {
      const result = await buyStock({
        userId: user.id,
        stockId: Number(stock.stock_id ?? 0),
        price: Number(stock.current_price ?? 0),
        quantity: 1,
        isSolo: true,
      });

      if (!result.success) {
        toast.error(result.message ?? "Buy failed");
        console.error("buyStock failed:", result);
        return;
      }

      toast.success("Bought 1 share to Solo — portfolio updated.");
    } catch (err) {
      console.error("Unexpected buy error:", err);
      toast.error("Unexpected error while buying. See console.");
    } finally {
      setBuying(false);
    }
  }

  return (
    <PageContent>
      {loading ? (
        <p className="text-gray-600">Loading stock data...</p>
      ) : error ? (
        <p className="text-red-600">Error: {error.message ?? String(error)}</p>
      ) : stock ? (
        <div className="flex items-center justify-between border p-4 rounded-md shadow-md">
          <div>
            <p className="text-lg font-bold">{stock.name ?? stock.stock_symbol}</p>
            <p className="text-gray-600">${Number(stock.current_price ?? 0).toFixed(2)}</p>
          </div>
          <button
            onClick={handleBuy}
            disabled={buying}
            className={`text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded ${
              buying ? "opacity-60" : ""
            }`}
          >
            {buying ? "Buying..." : "Buy"}
          </button>
        </div>
      ) : (
        <p className="text-gray-600">No stock found for GOOG</p>
      )}
    </PageContent>
  );
}

export default Discover;
