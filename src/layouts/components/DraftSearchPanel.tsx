import { useEffect, useState, useMemo } from "react";
import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getSectorByLeagueId } from "@/lib/leagues";
import { type StockRow } from "@/lib/stocks";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DraftSearchPanelProps {
  onStockClick: (stockId: number) => void;
}

const formatNumber = (num?: number | null) => {
  if (!num) return "-";
  if (num >= 1_000_000_000_000)
    return (num / 1_000_000_000_000).toFixed(1) + "T";
  if (num >= 1_000_000_000)
    return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000)
    return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000)
    return (num / 1_000).toFixed(1) + "K";
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

  const [sortColumn, setSortColumn] =
    useState<keyof StockRow | "price">("market_cap");
  const [sortDirection, setSortDirection] =
    useState<"asc" | "desc">("desc");

  const [exchangeFilter, setExchangeFilter] = useState<string>("All");
  const [sectorFilter, setSectorFilter] = useState<string>("All");

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
      const leagueSectorFilter = leagueData ?? [];

      let query = supabase
        .from("Stocks")
        .select("*")
        .order("market_cap", { ascending: false });

      if (!leagueSectorFilter.includes("Any")) {
        query = query.in("sector", leagueSectorFilter);
      }

      const { data, error } = await query;

      if (!error && data) {
        setStocks(data as StockRow[]);
      }

      setLoading(false);
    };

    fetchStocks();
  }, [leagueId]);

  const isQueued = (stockId: number) =>
    queuedItems.some((i) => i.stock_id === stockId);

  const exchangeOptions = useMemo(() => {
    const values = new Set(
      stocks.map((s) => s.exchange).filter(Boolean)
    );
    return ["All", ...(Array.from(values) as string[])];
  }, [stocks]);

  const sectorOptions = useMemo(() => {
    const values = new Set(
      stocks.map((s) => s.sector).filter(Boolean)
    );
    return ["All", ...(Array.from(values) as string[])];
  }, [stocks]);

  const handleSort = (column: keyof StockRow | "price") => {
    if (sortColumn === column) {
      setSortDirection((prev) =>
        prev === "asc" ? "desc" : "asc"
      );
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const filteredStocks = useMemo(() => {
    return stocks
      .filter((stock) => {
        const term = searchTerm.toLowerCase();
        return (
          stock.stock_symbol.toLowerCase().includes(term) ||
          stock.name.toLowerCase().includes(term)
        );
      })
      .filter((stock) => !draftedStockIds.has(stock.stock_id))
      .filter((stock) =>
        exchangeFilter === "All"
          ? true
          : stock.exchange === exchangeFilter
      )
      .filter((stock) =>
        sectorFilter === "All"
          ? true
          : stock.sector === sectorFilter
      );
  }, [
    stocks,
    searchTerm,
    draftedStockIds,
    exchangeFilter,
    sectorFilter,
  ]);

  const sortedStocks = useMemo(() => {
    const sorted = [...filteredStocks].sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      if (sortColumn === "price") {
        aValue =
          stockPrices[a.stock_id] ?? a.current_price ?? 0;
        bValue =
          stockPrices[b.stock_id] ?? b.current_price ?? 0;
      } else {
        const aField = a[sortColumn];
        const bField = b[sortColumn];

        aValue =
          typeof aField === "number"
            ? aField
            : (aField ?? "").toString();
        bValue =
          typeof bField === "number"
            ? bField
            : (bField ?? "").toString();
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc"
          ? aValue - bValue
          : bValue - aValue;
      }

      return sortDirection === "asc"
        ? String(aValue).localeCompare(String(aValue))
        : String(bValue).localeCompare(String(aValue));
    });

    return sorted;
  }, [filteredStocks, sortColumn, sortDirection, stockPrices]);

  const sortIndicator = (column: keyof StockRow | "price") => {
    if (sortColumn !== column) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search + Filters */}
      <div className="p-2 flex items-end gap-4">
        {/* Search */}
        <div className="relative w-72">
          <Search className="absolute left-2 top-2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search all stocks"
            value={searchTerm}
            onChange={(e) =>
              setSearchTerm(e.target.value)
            }
            className="w-full pl-8 pr-2 py-1 text-sm bg-gray-100 border border-gray-200 rounded-sm"
          />
        </div>

        {/* Exchange Filter */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
            Exchange
          </label>
          <Select
            value={exchangeFilter}
            onValueChange={setExchangeFilter}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {exchangeOptions.map((ex) => (
                <SelectItem key={ex} value={ex}>
                  {ex}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sector Filter */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
            Sector
          </label>
          <Select
            value={sectorFilter}
            onValueChange={setSectorFilter}
          >
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sectorOptions.map((sec) => (
                <SelectItem key={sec} value={sec}>
                  {sec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="mx-4 mb-4 flex-1 overflow-auto border border-gray-200 rounded-sm text-xs">
        <div className="min-w-[900px]">
          {/* Header */}
          <div className="grid grid-cols-[90px_60px_100px_1fr_120px_130px_120px_120px] gap-2 px-3 py-1 font-semibold bg-gray-50 border-b sticky top-0 z-10">
            <div></div>
            <div></div>

            <div
              className="cursor-pointer"
              onClick={() =>
                handleSort("stock_symbol")
              }
            >
              Symbol{sortIndicator("stock_symbol")}
            </div>

            <div
              className="cursor-pointer"
              onClick={() => handleSort("name")}
            >
              Name{sortIndicator("name")}
            </div>

            <div
              className="text-right cursor-pointer"
              onClick={() => handleSort("price")}
            >
              Price{sortIndicator("price")}
            </div>

            <div
              className="text-right cursor-pointer"
              onClick={() =>
                handleSort("market_cap")
              }
            >
              Market Cap
              {sortIndicator("market_cap")}
            </div>

            <div
              className="text-right cursor-pointer"
              onClick={() =>
                handleSort("volume")
              }
            >
              Volume{sortIndicator("volume")}
            </div>

            <div
              className="cursor-pointer"
              onClick={() =>
                handleSort("sector")
              }
            >
              Sector{sortIndicator("sector")}
            </div>
          </div>

          {loading && (
            <div className="p-2 text-sm text-gray-500">
              Loading stocks…
            </div>
          )}

          {!loading &&
            sortedStocks.map((stock) => {
              const queued = isQueued(stock.stock_id);

              const livePrice =
                stockPrices[stock.stock_id] ??
                stock.current_price ??
                0;

              return (
                <div
                  key={stock.stock_id}
                  onClick={() =>
                    onStockClick(stock.stock_id)
                  }
                  className="grid grid-cols-[90px_60px_100px_1fr_120px_130px_120px_120px] gap-2 px-3 py-1 items-center border-b hover:bg-gray-100 cursor-pointer"
                >
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

                  {stock.logo_url ? (
                    <img
                      src={stock.logo_url}
                      alt={stock.stock_symbol}
                      className="w-7 h-7 object-contain"
                    />
                  ) : (
                    <div className="w-7 h-7 bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                      {stock.stock_symbol[0]}
                    </div>
                  )}

                  <div className="font-semibold">
                    {stock.stock_symbol}
                  </div>

                  <div className="text-gray-700 truncate">
                    {stock.name}
                  </div>

                  <div className="font-mono text-right">
                    ${livePrice.toFixed(2)}
                  </div>

                  <div className="text-right text-gray-700">
                    {formatNumber(stock.market_cap)}
                  </div>

                  <div className="text-right text-gray-700">
                    {formatNumber(stock.volume)}
                  </div>

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