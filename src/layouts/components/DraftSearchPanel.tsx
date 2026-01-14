import { useEffect, useState } from "react";
import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";

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
  } = useDraft();

  const { user } = useAuth();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const isMyPick =
    !!user &&
    !!activePortfolio &&
    activePortfolio.user_id === user.id;

  const canDraft =
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

  const isQueued = (stockId: number) =>
    queuedItems.some((i) => i.stock_id === stockId);

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
          filteredStocks.map((stock) => (
            <div
              key={stock.stock_id}
              className="grid grid-cols-[90px_120px_1fr_140px_120px] gap-2 px-3 py-1 items-center border-b hover:bg-gray-100"
            >
              {/* Action */}
              <Button
                size="sm"
                disabled={!canDraft && isQueued(stock.stock_id)}
                onClick={() =>
                  canDraft
                    ? makePick(stock.stock_id)
                    : queueStock(stock.stock_id)
                }
              >
                {canDraft
                  ? "Draft"
                  : isQueued(stock.stock_id)
                  ? "Queued"
                  : "Queue"}
              </Button>

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
          ))}
      </div>
    </div>
  );
};

export default DraftSearchPanel;