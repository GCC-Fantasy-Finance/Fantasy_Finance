import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageContent from "../../../layouts/components/PageContent";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getAllStocks } from "@/lib/stocks";
import { Input } from "@/components/ui/input";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SectorStock {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  sector?: string;
}

interface RawSectorStock extends Omit<SectorStock, "sector"> {
  sector?: string | null;
}

function toSectorSlug(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}

function SectorPage() {
  const { sector } = useParams<{ sector: string }>();
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<SectorStock | null>(null);
  const [showStockModal, setShowStockModal] = useState(false);
  
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
            sector: stock.sector ?? undefined,
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        if (mounted) {
          setStocks(filteredBySector);
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

  const visibleStocks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    if (!query) {
      return stocks;
    }

    return stocks.filter((stock) =>
      stock.name.toLowerCase().includes(query) ||
      stock.stock_symbol.toLowerCase().includes(query),
    );
  }, [searchQuery, stocks]);

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

          <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-600 py-6">
                      Loading stocks...
                    </TableCell>
                  </TableRow>
                ) : visibleStocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-600 py-6">
                      No stocks found.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleStocks.map((stock) => (
                    <TableRow
                      key={stock.stock_id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedStock(stock);
                        setShowStockModal(true);
                      }}
                    >
                      <TableCell className="font-medium">{stock.name}</TableCell>
                      <TableCell>{stock.stock_symbol}</TableCell>
                      <TableCell className="text-right">
                        ${stock.current_price.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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
