import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageContent from "../../../layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getAllStocks, type StockRow } from "@/lib/stocks";
import { calculateStockPercentChange } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import { getSearchScore } from "@/lib/searchUtils";
import Ticker from "@/components/ui/ticker";

interface RawSectorStock extends Omit<StockRow, "sector"> {
  sector?: string | null;
}

type SortColumn =
  | "stock_symbol"
  | "name"
  | "day_change"
  | "price"
  | "market_cap"
  | "volume";

const formatNumber = (num?: number | null) => {
  if (!num) return "-";
  if (num >= 1_000_000_000_000)
    return (num / 1_000_000_000_000).toFixed(1) + "T";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
};

function toSectorSlug(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}

function SectorPage() {
  const { sector } = useParams<{ sector: string }>();
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);
  const [showStockModal, setShowStockModal] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("market_cap");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Convert URL-friendly sector name back to display name
  const displaySector = sector
    ?.split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const sectorSlug = (sector ?? "").toLowerCase();

  usePageTitle("Discover");

  useEffect(() => {
    let mounted = true;

    async function loadSectorStocks() {
      setLoading(true);
      try {
        const allStocks = (await getAllStocks()) as RawSectorStock[];
        const filteredBySector = allStocks
          .filter((stock) =>
            toSectorSlug(stock.sector ?? "") === sectorSlug,
          )
          .map((stock) => ({
            ...stock,
            sector: stock.sector ?? "",
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        if (mounted) {
          setStocks(filteredBySector as StockRow[]);
        }
      } catch (error) {
        console.error("Failed to load sector stocks:", error);
        if (mounted) {
          setStocks([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadSectorStocks();

    return () => {
      mounted = false;
    };
  }, [sectorSlug]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const HeaderCell = (
    label: string,
    column: SortColumn,
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

  const visibleStocks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    if (!query) {
      return [...stocks].sort((left, right) => {
        let leftValue: string | number;
        let rightValue: string | number;

        if (sortColumn === "day_change") {
          leftValue = calculateStockPercentChange(
            left.current_price,
            left.previous_close,
          );
          rightValue = calculateStockPercentChange(
            right.current_price,
            right.previous_close,
          );
        } else if (sortColumn === "price") {
          leftValue = left.current_price;
          rightValue = right.current_price;
        } else {
          leftValue = left[sortColumn];
          rightValue = right[sortColumn];
        }

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return sortDirection === "asc"
            ? leftValue - rightValue
            : rightValue - leftValue;
        }

        return sortDirection === "asc"
          ? String(leftValue).localeCompare(String(rightValue))
          : String(rightValue).localeCompare(String(leftValue));
      });
    }

    return stocks
      .filter(
        (stock) =>
          stock.name.toLowerCase().includes(query) ||
          stock.stock_symbol.toLowerCase().includes(query),
      )
      .sort((a, b) => getSearchScore(b, query) - getSearchScore(a, query));
  }, [searchQuery, stocks, sortColumn, sortDirection]);

  const trendingStocks = useMemo(() => {
    return stocks
      .map((stock) => ({
        ...stock,
        percentChange: calculateStockPercentChange(
          stock.current_price,
          stock.previous_close,
        ),
      }))
      .filter((stock) => stock.percentChange > 0)
      .sort((left, right) => right.percentChange - left.percentChange)
      .slice(0, 3);
  }, [stocks]);

  return (
    <PageContent>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/discover")}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back to Discover"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{displaySector}</h1>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900">Trending</h2>
          <p className="text-gray-700">
            Top 3 {displaySector} stocks by daily percentage gain.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {loading ? (
              <div className="md:col-span-3 flex items-center justify-center py-12">
                <p className="text-gray-600">Loading trending stocks...</p>
              </div>
            ) : trendingStocks.length === 0 ? (
              <div className="md:col-span-3 border border-gray-300 rounded-md px-4 py-6 text-center text-gray-600 bg-white">
                No positive movers found.
              </div>
            ) : (
              trendingStocks.map((stock) => (
                <button
                  key={stock.stock_id}
                  type="button"
                  onClick={() => {
                    setSelectedStock(stock);
                    setShowStockModal(true);
                  }}
                  className="border border-gray-300 rounded-md px-4 py-3 text-left bg-white hover:bg-gray-50 transition-colors"
                >
                  <p className="font-semibold text-gray-900 truncate">{stock.name}</p>
                  <p className="text-sm text-gray-600">{stock.stock_symbol}</p>
                  <p className="text-sm text-gray-900 mt-2">
                    ${stock.current_price.toFixed(2)}
                  </p>
                  <p className="text-sm font-semibold text-green-700">
                    +{calculateStockPercentChange(stock.current_price, stock.previous_close).toFixed(2)}%
                  </p>
                </button>
              ))
            )}
          </div>

          <h2 className="text-2xl font-semibold text-gray-900">
            All {displaySector} Stocks
          </h2>

          <div className="max-w-md">
            <Input
              type="text"
              placeholder="Search for stocks..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="border border-gray-300 rounded-md overflow-hidden bg-white text-xs">
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-[44px_90px_1fr_110px_90px_110px_100px] gap-2 px-3 py-2 font-semibold bg-gray-50 border-b">
                  <div></div>
                  {HeaderCell("Symbol", "stock_symbol")}
                  {HeaderCell("Name", "name")}
                  {HeaderCell("Day Change", "day_change", "right")}
                  {HeaderCell("Price", "price", "right")}
                  {HeaderCell("Market Cap", "market_cap", "right")}
                  {HeaderCell("Volume", "volume", "right")}
                </div>

                {loading ? (
                  <div className="px-3 py-12 text-center text-gray-600">Loading stocks...</div>
                ) : visibleStocks.length === 0 ? (
                  <div className="px-3 py-6 text-center text-gray-600">No stocks found.</div>
                ) : (
                  visibleStocks.map((stock) => (
                    <div
                      key={stock.stock_id}
                      className="grid grid-cols-[44px_90px_1fr_110px_90px_110px_100px] gap-2 px-3 py-1 items-center border-b hover:bg-green-100/60 cursor-pointer"
                      onClick={() => {
                        setSelectedStock(stock);
                        setShowStockModal(true);
                      }}
                    >
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

                      <div className="font-semibold">{stock.stock_symbol}</div>
                      <div className="text-gray-700 truncate">{stock.name}</div>

                      <div className="flex justify-end">
                        <Ticker
                          currentValue={stock.current_price}
                          previousValue={stock.previous_close}
                          size="small"
                        />
                      </div>

                      <div className="font-mono text-right">
                        ${stock.current_price.toFixed(2)}
                      </div>

                      <div className="text-right text-gray-700">
                        {formatNumber(stock.market_cap)}
                      </div>

                      <div className="text-right text-gray-700">
                        {formatNumber(stock.volume)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <StockDetailsModal
        open={showStockModal}
        stock={selectedStock}
        onClose={() => setShowStockModal(false)}
      />
    </PageContent>
  );
}

export default SectorPage;
