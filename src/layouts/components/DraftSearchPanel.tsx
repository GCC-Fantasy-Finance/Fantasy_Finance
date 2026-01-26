import { useEffect, useState } from "react";
import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { removeWishlistItem } from "../../lib/wishlists";

type Stock = {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  sector: string;
};

const DraftSearchPanel = () => {
  const {
    makePick,
    queueStock,
    activePortfolio,
    draftStarted,
    draftEnded,
    queuedItems,
    myPortfolio,
    // Optionally: add a function to refresh the queue after removal
  } = useDraft();

  const { user } = useAuth();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);
  const [localQueuedItems, setLocalQueuedItems] = useState(queuedItems);

  const isMyPick =
    !!user &&
    !!activePortfolio &&
    activePortfolio.user_id === user.id;
  
  const canDraft =
    activePortfolio &&
    myPortfolio &&
    draftStarted &&
    !draftEnded &&
    isMyPick;

  useEffect(() => {
    const fetchStocks = async () => {
      const { data, error } = await supabase
        .from("Stocks")
        .select("*")
        .order("stock_symbol");

      if (!error) setStocks(data ?? []);
      setLoading(false);
    };

    fetchStocks();
  }, []);

  // Keep localQueuedItems in sync with context unless we're removing
  useEffect(() => {
    if (removing === null) {
      setLocalQueuedItems(queuedItems);
    }
  }, [queuedItems, removing]);

  const isQueued = (stockId: number) =>
    localQueuedItems.some((i) => i.stock_id === stockId);

  // Remove from queue handler
  const handleRemove = async (stockId: number) => {
    if (!myPortfolio?.portfolio_id) return;
    setRemoving(stockId);
    // Optimistically update local state
    setLocalQueuedItems((prev) => prev.filter((i) => i.stock_id !== stockId));
    try {
      await removeWishlistItem(myPortfolio.portfolio_id, stockId);
      // The context will update from the backend shortly
    } catch (err) {
      console.error("Failed to remove from queue:", err);
      // Revert optimistic update if error
      setLocalQueuedItems(queuedItems);
    }
    setRemoving(null);
  };

  // list of stocks that is displayed
  const filteredStocks = stocks.filter(
    (stock) =>
      stock.stock_symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="p-2">
        <div className="relative w-96">
          <Search className="absolute left-2 top-2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search all stocks"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2 py-1 text-sm bg-gray-100 border border-gray-200 rounded-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="mx-4 mb-4 flex-1 overflow-y-auto border border-gray-200 rounded-sm">
        {/* Header */}
        <div className="grid grid-cols-[90px_120px_1fr_140px_120px] gap-2 px-3 py-1 text-sm font-semibold bg-gray-50 border-b sticky top-0 z-10">
          <div>Action</div>
          <div>Symbol</div>
          <div>Name</div>
          <div className="text-right">Price</div>
          <div>Sector</div>
        </div>

        {loading && (
          <div className="p-2 text-sm text-gray-500">
            Loading stocks…
          </div>
        )}

        {!loading &&
          filteredStocks.map((stock) => {
            const queued = isQueued(stock.stock_id);
            return (
              <div
                key={stock.stock_id}
                className="grid grid-cols-[90px_120px_1fr_140px_120px] gap-2 px-3 py-1 items-center border-b hover:bg-gray-100"
              >
                {/* Action */}
                {queued ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={removing === stock.stock_id}
                    onClick={() => handleRemove(stock.stock_id)}
                  >
                    {removing === stock.stock_id ? "Removing..." : "Remove"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      canDraft
                        ? makePick(stock.stock_id)
                        : queueStock(stock.stock_id)
                    }
                  >
                    {canDraft ? "Draft" : "Queue"}
                  </Button>
                )}

                {/* Symbol */}
                <div className="text-sm font-semibold">
                  {stock.stock_symbol}
                </div>

                {/* Name */}
                <div className="text-sm text-gray-700 truncate">
                  {stock.name}
                </div>

                {/* Price */}
                <div className="text-sm font-mono text-right">
                  ${stock.current_price.toFixed(2)}
                </div>

                {/* Sector */}
                <div className="text-sm text-gray-500 truncate">
                  {stock.sector}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default DraftSearchPanel;