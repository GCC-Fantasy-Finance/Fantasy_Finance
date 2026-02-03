import { useEffect, useState } from "react";
import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getSectorByLeagueId } from "@/lib/leagues";

type Stock = {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  sector: string;
};

interface DraftSearchPanelProps {
  onStockClick: (stockId: number) => void;
}

const DraftSearchPanel = ({ onStockClick }: DraftSearchPanelProps) => {
  const {
    makePick,
    queueStock,
    removeFromQueue,
    activePortfolio,
    draftStarted,
    draftEnded,
    queuedItems,
    myPortfolio,
    stockPrices,
    leagueId,
  } = useDraft();

  const { user } = useAuth();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const isMyPick = !!user && !!activePortfolio && activePortfolio.user_id === user.id;

  const canDraft =
    activePortfolio &&
    myPortfolio &&
    draftStarted &&
    !draftEnded &&
    isMyPick;

  // Initial fetch of stock table
  useEffect(() => {
    const fetchStocks = async () => {
      setLoading(true);

      const leagueData = await getSectorByLeagueId(leagueId);
      const sectorFilter = leagueData ?? [];

      let query = supabase.from("Stocks").select("*").order("stock_symbol");

      if (!sectorFilter.includes("Any")) {
        query = query.in("sector", sectorFilter);
      }

      const { data, error } = await query;
      if (!error) setStocks(data ?? []);

      setLoading(false);
    };

    fetchStocks();
  }, [leagueId]);

  const isQueued = (stockId: number) =>
    queuedItems.some((i) => i.stock_id === stockId);

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
          <div></div>
          <div>Symbol</div>
          <div>Name</div>
          <div className="text-right">Price</div>
          <div>Sector</div>
        </div>

        {loading && (
          <div className="p-2 text-sm text-gray-500">Loading stocks…</div>
        )}

        {!loading &&
          filteredStocks.map((stock) => {
            const queued = isQueued(stock.stock_id);

            // Use live price from context if available
            const livePrice = stockPrices[stock.stock_id] ?? stock.current_price;

            return (
              <div
                key={stock.stock_id}
                className="grid grid-cols-[90px_120px_1fr_140px_120px] gap-2 px-3 py-1 items-center border-b hover:bg-gray-100"
              >
                {/* Action */}
                {queued ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-700 text-red-700 bg-white hover:bg-gray-100"
                    onClick={() => removeFromQueue(stock.stock_id)}
                  >
                    Remove
                  </Button>
                ) : canDraft ? (
                  <Button
                    size="sm"
                    onClick={() => makePick(stock.stock_id)}
                  >
                    Draft
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-700 text-green-700 bg-white hover:bg-gray-100"
                    onClick={() => queueStock(stock.stock_id)}
                  >
                    Queue
                  </Button>
                )}

                {/* Symbol */}
                <div
                  className="text-sm font-semibold cursor-pointer"
                  onClick={() => onStockClick(stock.stock_id)} // click opens modal
                >
                  {stock.stock_symbol}
                </div>

                {/* Name */}
                <div
                  className="text-sm text-gray-700 truncate cursor-pointer"
                  onClick={() => onStockClick(stock.stock_id)} // click opens modal
                >
                  {stock.name}
                </div>

                {/* Price */}
                <div className="text-sm font-mono text-right">
                  ${livePrice.toFixed(2)}
                </div>

                {/* Sector */}
                <div className="text-sm text-gray-500 truncate">{stock.sector}</div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default DraftSearchPanel;