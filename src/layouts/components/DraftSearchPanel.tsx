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

      if (!error) {
        setStocks(data ?? []);
      }

      setLoading(false);
    };

    fetchStocks();
  }, []);

  const isQueued = (stockId: number) =>
    queuedItems.some((i) => i.stock_id === stockId);

  const filteredStocks = stocks.filter(
    (stock) =>
      stock.stock_symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4">
        <div className="relative w-96">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search all stocks"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1 text-sm bg-gray-100 border border-gray-200 rounded-sm"
          />
        </div>
      </div>

      <div className="mx-4 mb-4 flex-1 overflow-y-auto border border-gray-200 rounded-sm">
        {loading && (
          <div className="p-3 text-sm text-gray-500">
            Loading stocks…
          </div>
        )}

        {!loading &&
          filteredStocks.map((stock) => (
            <div
              key={stock.stock_id}
              className="flex items-center px-3 py-2 text-sm hover:bg-gray-100"
            >
              <Button
                size="sm"
                disabled={!canDraft && isQueued(stock.stock_id)}
                onClick={() =>
                  canDraft
                    ? makePick(stock.stock_id)
                    : queueStock(stock.stock_id)
                }
                className="mr-2"
              >
                {canDraft
                  ? "Draft"
                  : isQueued(stock.stock_id)
                  ? "Queued"
                  : "Queue"}
              </Button>

              <div className="flex-1">
                <div className="font-medium">
                  {stock.stock_symbol}
                </div>
                <div className="text-xs text-gray-500">
                  {stock.name}
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono">
                  ${stock.current_price.toFixed(2)}
                </div>
                <div className="text-xs text-gray-400">
                  {stock.sector}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default DraftSearchPanel;