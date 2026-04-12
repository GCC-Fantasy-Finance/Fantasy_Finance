import { useEffect, useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { getSectorByLeagueId } from "@/lib/leagues";
import { type StockRow } from "@/lib/stocks";
import Ticker from "@/components/ui/ticker";
import SearchIcon from "@/components/ui/search-icon";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { getSearchScore } from "@/lib/searchUtils";

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

  const [sortColumn, setSortColumn] = useState<
    keyof StockRow | "price" | "day_change"
  >("market_cap");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [exchangeFilter, setExchangeFilter] = useState<string>("All");
  const [sectorFilter, setSectorFilter] = useState<string>("All");

  const scrollContainer = useRef<HTMLDivElement>(null);

  const isMyPick =
    !!user && !!activePortfolio && activePortfolio.user_id === user.id;

  const canDraft =
    activePortfolio && myPortfolio && draftStarted && !draftEnded && isMyPick;

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

  const handleSort = (column: keyof StockRow | "price" | "day_change") => {
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
    align: "left" | "right" = "left",
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
          {sortColumn === column ? (sortDirection === "asc" ? "▲" : "▼") : ""}
        </span>
      </span>
    </div>
  );

  const filteredStocks = useMemo(() => {
    let filtered = stocks
      .filter((stock) => {
        const term = searchTerm.toLowerCase();
        return (
          stock.stock_symbol.toLowerCase().includes(term) ||
          stock.name.toLowerCase().includes(term)
        );
      })
      .filter((stock) => !draftedStockIds.has(stock.stock_id))
      .filter((stock) =>
        exchangeFilter === "All" ? true : stock.exchange === exchangeFilter,
      )
      .filter((stock) =>
        sectorFilter === "All" ? true : stock.sector === sectorFilter,
      );

    // Sort by search relevance when there's a search term
    if (searchTerm.length > 0) {
      filtered = filtered.sort(
        (a, b) => getSearchScore(b, searchTerm) - getSearchScore(a, searchTerm),
      );
    }

    return filtered;
  }, [stocks, searchTerm, draftedStockIds, exchangeFilter, sectorFilter]);

  const sortedStocks = useMemo(() => {
    // If there's a search term, keep the search relevance sorting from filteredStocks
    if (searchTerm.length > 0) {
      return filteredStocks;
    }

    // Otherwise, sort by the selected column
    const sorted = [...filteredStocks].sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      if (sortColumn === "price") {
        aValue = stockPrices[a.stock_id] ?? a.current_price ?? 0;
        bValue = stockPrices[b.stock_id] ?? b.current_price ?? 0;
      } else if (sortColumn === "day_change") {
        const aCurrent = stockPrices[a.stock_id] ?? a.current_price ?? 0;
        const bCurrent = stockPrices[b.stock_id] ?? b.current_price ?? 0;

        const aPrev = a.previous_close ?? 0;
        const bPrev = b.previous_close ?? 0;

        const aPct = aPrev === 0 ? 0 : (aCurrent - aPrev) / aPrev;
        const bPct = bPrev === 0 ? 0 : (bCurrent - bPrev) / bPrev;

        aValue = aPct;
        bValue = bPct;
      } else {
        const aField = a[sortColumn];
        const bField = b[sortColumn];

        aValue =
          typeof aField === "number" ? aField : (aField ?? "").toString();
        bValue =
          typeof bField === "number" ? bField : (bField ?? "").toString();
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      return sortDirection === "asc"
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });

    return sorted;
  }, [filteredStocks, sortColumn, sortDirection, stockPrices, searchTerm]);

  const virtualizer = useVirtualizer({
    count: sortedStocks.length,
    getScrollElement: () => scrollContainer.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  return (
    <section className="flex flex-col h-full min-h-0 @container" aria-label="Stock search and filter">
      <div className="p-2 flex flex-col gap-2 items-stretch [@container(min-width:700px)]:flex-row [@container(min-width:700px)]:items-end">
        <div className="relative w-full [@container(min-width:700px)]:flex-1">
          <Input
            type="text"
            placeholder="Search all stocks"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 pr-8 pl-8"
          />
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 [@container(min-width:500px)]:flex-row">
          <Select value={exchangeFilter} onValueChange={setExchangeFilter}>
            <SelectTrigger
              className="h-8 text-sm w-full [@container(min-width:700px)]:w-46"
              aria-label="Exchange"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                <span className="text-gray-500">Exchange:</span>
                <SelectValue className="min-w-0 truncate" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {exchangeOptions.map((ex) => (
                <SelectItem key={ex} value={ex}>
                  {ex}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger
              className="h-8 text-sm w-full [@container(min-width:700px)]:w-56"
              aria-label="Sector"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                <span className="text-gray-500">Sector:</span>
                <SelectValue className="min-w-0 truncate" />
              </span>
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
        className="mx-2 mb-2 pb-20 flex-1 overflow-auto border border-gray-200 rounded-sm text-xs"
      >
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[90px_44px_90px_1fr_110px_90px_110px_100px_110px] gap-2 px-3 py-2 font-semibold bg-gray-50 border-b sticky top-0 z-10">
            {!draftEnded && <div></div>}
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
                  stockPrices[stock.stock_id] ?? stock.current_price ?? 0;

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
                      className="grid grid-cols-[90px_44px_90px_1fr_110px_90px_110px_100px_110px] gap-2 px-3 py-1 items-center border-b hover:bg-green-100/60 cursor-pointer"
                    >
                      {!draftEnded && (
                        <>
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
                        </>
                      )}

                      {stock.logo_url ? (
                        <img
                          src={stock.logo_url}
                          alt={stock.stock_symbol}
                          className="w-7 h-7 object-contain rounded-sm"
                        />
                      ) : (
                        <div className="w-7 h-7 bg-gray-200 flex items-center justify-center text-gray-500 text-xs rounded-sm">
                          {stock.stock_symbol[0]}
                        </div>
                      )}

                      <div className="font-semibold">{stock.stock_symbol}</div>

                      <div className="text-gray-700 truncate">{stock.name}</div>

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
      </section>
    );
  };

  export default DraftSearchPanel;
