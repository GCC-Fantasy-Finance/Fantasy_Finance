import { useEffect, useState } from "react";
import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getSectorByLeagueId } from "@/lib/leagues";
import { type StockRow } from "@/lib/stocks";

interface DraftSearchPanelProps {
  onStockClick: (stockId: number) => void;
}

const formatNumber = (num?: number | null) => {
  if (!num) return "-";
  if (num >= 1_000_000_000_000) return (num / 1_000_000_000_000).toFixed(1) + "T";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
};

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
    draftedStockIds,
    isMakingPick,
  } = useDraft();

  const { user } = useAuth();

  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const isMyPick =
    !!user && !!activePortfolio && activePortfolio.user_id === user.id;

  const canDraft =
    activePortfolio &&
    myPortfolio &&
    draftStarted &&
    !draftEnded &&
    isMyPick;

  useEffect(() => {
    const fetchStocks = async () => {
      setLoading(true);

      const leagueData = await getSectorByLeagueId(leagueId);
      const sectorFilter = leagueData ?? [];

      let query = supabase.from("Stocks").select("*").order("market_cap", { ascending: false });;

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

  const filteredStocks = stocks
    .filter(
      (stock) =>
        stock.stock_symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((stock) => !draftedStockIds.has(stock.stock_id));

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

      {/* Table Container */}
      <div className="mx-4 mb-4 flex-1 overflow-auto border border-gray-200 rounded-sm text-xs">
        {/* Min width wrapper prevents column crushing */}
        <div className="min-w-[900px]">
          {/* Header */}
          <div className="grid grid-cols-[90px_60px_100px_1fr_120px_130px_120px_120px] gap-2 px-3 py-1 font-semibold bg-gray-50 border-b sticky top-0 z-10">
            <div></div>
            <div></div>
            <div>Symbol</div>
            <div>Name</div>
            <div className="text-right">Price</div>
            <div className="text-right">Market Cap</div>
            <div className="text-right">Volume</div>
            <div>Sector</div>
          </div>

          {loading && (
            <div className="p-2 text-sm text-gray-500">Loading stocks…</div>
          )}

          {!loading &&
            filteredStocks.map((stock) => {
              const queued = isQueued(stock.stock_id);
              const livePrice =
                stockPrices[stock.stock_id] ?? stock.current_price;

              return (
                <div
                  key={stock.stock_id}
                  onClick={() => onStockClick(stock.stock_id)}
                  className="grid grid-cols-[90px_60px_100px_1fr_120px_130px_120px_120px] gap-2 px-3 py-1 items-center border-b hover:bg-gray-100 cursor-pointer"
                >
                  {/* Draft / Queue */}
                  {canDraft ? (
                    <Button
                      size="sm"
                      disabled={isMakingPick}
                      onClick={(e) => {
                        e.stopPropagation();
                        makePick(stock.stock_id);
                      }}
                    >
                      Draft
                    </Button>
                  ) : queued ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-700 text-red-700 bg-white hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(stock.stock_id);
                      }}
                    >
                      Dequeue
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-700 text-green-700 bg-white hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        queueStock(stock.stock_id);
                      }}
                    >
                      Queue
                    </Button>
                  )}

                  {/* Logo */}
                  {stock.logo_url ? (
                    <img
                      src={stock.logo_url}
                      alt={stock.stock_symbol}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs select-none">
                      {stock.stock_symbol[0]}
                    </div>
                  )}

                  {/* Symbol */}
                  <div className="font-semibold">
                    {stock.stock_symbol}
                  </div>

                  {/* Name */}
                  <div className="text-gray-700 truncate">
                    {stock.name}
                  </div>

                  {/* Price */}
                  <div className="font-mono text-right">
                    ${livePrice.toFixed(2)}
                  </div>

                  {/* Market Cap */}
                  <div className="text-right text-gray-700">
                    {formatNumber(stock.market_cap)}
                  </div>

                  {/* Volume */}
                  <div className="text-right text-gray-700">
                    {formatNumber(stock.volume)}
                  </div>

                  {/* Sector */}
                  <div className="text-gray-500 truncate">
                    {stock.sector}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default DraftSearchPanel;