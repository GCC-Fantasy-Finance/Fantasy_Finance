import { useEffect, useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getSectorByLeagueId } from "@/lib/leagues";
import { type StockRow } from "@/lib/stocks";
import Ticker from "@/components/ui/ticker";

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
    useState<keyof StockRow | "price" | "day_change">("market_cap");
  const [sortDirection, setSortDirection] =
    useState<"asc" | "desc">("desc");

  const [exchangeFilter, setExchangeFilter] = useState<string>("All");
  const [sectorFilter, setSectorFilter] = useState<string>("All");

  const scrollContainer = useRef<HTMLDivElement>(null);

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
    const values = new Set(stocks.map((s) => s.exchange).filter(Boolean));
    return ["All", ...(Array.from(values) as string[])];
  }, [stocks]);

  const sectorOptions = useMemo(() => {
    const values = new Set(stocks.map((s) => s.sector).filter(Boolean));
    return ["All", ...(Array.from(values) as string[])];
  }, [stocks]);

  const handleSort = (
    column: keyof StockRow | "price" | "day_change"
  ) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const HeaderCell = (
    label: string,
    column: keyof StockRow | "price" | "day_change",
    align: "left" | "right" = "left"
  ) => (
    <div
      className={`cursor-pointer flex items-center ${
        align === "right" ? "justify-end text-right" : ""
      }`}
      onClick={() => handleSort(column)}
    >
      <span className="flex items-center whitespace-nowrap">
        {label}
        <span className="ml-1 w-3 inline-block text-gray-500">
          {sortColumn === column
            ? sortDirection === "asc"
              ? "▲"
              : "▼"
            : ""}
        </span>
      </span>
    </div>
  );

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
        exchangeFilter === "All" ? true : stock.exchange === exchangeFilter
      )
      .filter((stock) =>
        sectorFilter === "All" ? true : stock.sector === sectorFilter
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
        aValue = stockPrices[a.stock_id] ?? a.current_price ?? 0;
        bValue = stockPrices[b.stock_id] ?? b.current_price ?? 0;
      } else if (sortColumn === "day_change") {
        const aCurrent =
          stockPrices[a.stock_id] ?? a.current_price ?? 0;
        const bCurrent =
          stockPrices[b.stock_id] ?? b.current_price ?? 0;

        const aPrev = a.previous_close ?? 0;
        const bPrev = b.previous_close ?? 0;

        const aPct =
          aPrev === 0 ? 0 : (aCurrent - aPrev) / aPrev;
        const bPct =
          bPrev === 0 ? 0 : (bCurrent - bPrev) / bPrev;

        aValue = aPct;
        bValue = bPct;
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
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });

    return sorted;
  }, [filteredStocks, sortColumn, sortDirection, stockPrices]);

  const virtualizer = useVirtualizer({
    count: sortedStocks.length,
    getScrollElement: () => scrollContainer.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2 flex items-end gap-4">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search all stocks"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2 py-1 text-sm bg-gray-100 border border-gray-200 rounded-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-gray-500">
            Exchange
          </label>
          <Select value={exchangeFilter} onValueChange={setExchangeFilter}>
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

        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-gray-500">
            Sector
          </label>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
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

      <div
        ref={scrollContainer}
        className="mx-4 mb-4 flex-1 overflow-auto border border-gray-200 rounded-sm text-xs"
      >
        <div className="min-w-[900px]">

          <div className="grid grid-cols-[90px_44px_90px_1fr_110px_90px_110px_100px_110px] gap-2 px-3 py-1 font-semibold bg-gray-50 border-b sticky top-0 z-10">
            <div></div>
            <div></div>

            {HeaderCell("Symbol", "stock_symbol")}
            {HeaderCell("Name", "name")}
            {HeaderCell("Day Change", "day_change", "right")}
            {HeaderCell("Price", "price", "right")}
            {HeaderCell("Market Cap", "market_cap", "right")}
            {HeaderCell("Volume", "volume", "right")}
            {HeaderCell("Sector", "sector")}
          </div>

          {!loading && (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const stock = sortedStocks[virtualItem.index];
                const queued = isQueued(stock.stock_id);

                const livePrice =
                  stockPrices[stock.stock_id] ??
                  stock.current_price ??
                  0;

                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <div
                      onClick={() => {
                        if (!isMakingPick) {
                          onStockClick(stock.stock_id);
                        }
                      }}
                      className="grid grid-cols-[90px_44px_90px_1fr_110px_90px_110px_100px_110px] gap-2 px-3 py-1 items-center border-b hover:bg-gray-100 cursor-pointer"
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

                      <div className="flex justify-end">
                        <Ticker
                          currentValue={livePrice}
                          previousValue={stock.previous_close}
                          size="small"
                        />
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DraftSearchPanel;