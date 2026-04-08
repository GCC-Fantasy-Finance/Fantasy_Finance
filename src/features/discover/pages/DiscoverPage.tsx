import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useNavigate } from "react-router-dom";
import { getAllStocks } from "@/lib/stocks";
import { calculateStockPercentChange } from "@/lib/utils";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import {
  Building2,
  Cpu,
  Factory,
  Film,
  FlaskConical,
  Globe,
  HeartPulse,
  Landmark,
  Plane,
  Shield,
  ShoppingCart,
  Truck,
  UtilityPole,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

type StockWithSector = {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  previous_close: number;
  sector?: string;
};

type RawStockWithSector = Omit<StockWithSector, "sector"> & {
  sector?: string | null;
};

function toSectorSlug(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}

const sectorIconMap: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ["technology", "software", "semiconductor", "ai"], icon: Cpu },
  { keywords: ["health", "pharma", "biotech", "medical"], icon: HeartPulse },
  { keywords: ["finance", "bank", "insurance", "fintech"], icon: Landmark },
  { keywords: ["oil", "gas", "utilities"], icon: UtilityPole },
  { keywords: ["industrial", "manufacturing"], icon: Factory },
  { keywords: ["consumer", "retail", "ecommerce"], icon: ShoppingCart },
  { keywords: ["materials", "chemical"], icon: FlaskConical },
  { keywords: ["communication", "telecom", "media"], icon: Wifi },
  { keywords: ["real estate", "reit", "property"], icon: Building2 },
  { keywords: ["transport", "aerospace", "airline", "travel"], icon: Plane },
  { keywords: ["defense", "security"], icon: Shield },
  { keywords: ["logistics", "shipping"], icon: Truck },
  { keywords: ["entertainment"], icon: Film },
  {
    keywords: ["clean", "renewable", "sustainable", "green", "energy"],
    icon: Zap,
  },
  { keywords: ["global", "international"], icon: Globe },
];

function getSectorIcon(sector: string): LucideIcon {
  const normalizedSector = sector.toLowerCase();
  const match = sectorIconMap.find(({ keywords }) =>
    keywords.some((keyword) => normalizedSector.includes(keyword)),
  );

  return match?.icon ?? Building2;
}

function Discover() {
  usePageTitle("Discover");
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockWithSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStock, setSelectedStock] = useState<StockWithSector | null>(
    null,
  );
  const [showStockModal, setShowStockModal] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadStocks() {
      setLoading(true);
      try {
        const allStocks = (await getAllStocks()) as RawStockWithSector[];
        const normalizedStocks: StockWithSector[] = allStocks.map((stock) => ({
          ...stock,
          sector: stock.sector ?? undefined,
        }));
        if (mounted) {
          setStocks(normalizedStocks);
        }
      } catch (error) {
        console.error("Failed to load stocks for sectors:", error);
        if (mounted) {
          setStocks([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadStocks();

    return () => {
      mounted = false;
    };
  }, []);

  const sectors = useMemo(() => {
    const uniqueSectors = new Set(
      stocks
        .map((stock) => stock.sector?.trim())
        .filter((sector): sector is string => Boolean(sector)),
    );

    return Array.from(uniqueSectors).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [stocks]);

  const trendingStocks = useMemo(() => {
    return stocks
      .map((stock) => ({
        ...stock,
        percentChange: calculateStockPercentChange(
          stock.current_price,
          stock.previous_close,
        ),
      }))
      .sort((left, right) => right.percentChange - left.percentChange)
      .slice(0, 3);
  }, [stocks]);

  const handleSectorClick = (sector: string) => {
    const urlFriendlySector = toSectorSlug(sector);
    navigate(`/discover/sector/${urlFriendlySector}`);
  };

  return (
    <PageContent>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold mb-1 ">Trending Now</h2>
          <p className="text-gray-700 mb-4">
            Top 3 stocks by daily percentage change.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {loading ? (
              <div className="md:col-span-3 flex items-center justify-center py-12">
                <p className="text-gray-600">Loading trending stocks...</p>
              </div>
            ) : trendingStocks.length === 0 ? (
              <div className="md:col-span-3 border border-gray-300 rounded-md px-4 py-6 text-center text-gray-600 bg-white">
                No stocks available.
              </div>
            ) : (
              trendingStocks.map((stock) => {
                const percentChange = calculateStockPercentChange(
                  stock.current_price,
                  stock.previous_close,
                );

                return (
                  <button
                    key={stock.stock_id}
                    type="button"
                    onClick={() => {
                      setSelectedStock(stock);
                      setShowStockModal(true);
                    }}
                    className="cursor-pointer border border-gray-300 rounded-md px-4 py-3 text-left bg-white hover:bg-gray-50 transition-colors"
                  >
                    <p className="font-semibold  truncate">{stock.name}</p>
                    <p className="text-sm text-gray-600">
                      {stock.stock_symbol}
                    </p>
                    <p className="text-sm  mt-2">
                      ${stock.current_price.toFixed(2)}
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        percentChange < 0
                          ? "text-red-700"
                          : percentChange > 0
                            ? "text-green-700"
                            : "text-gray-700"
                      }`}
                    >
                      {percentChange > 0 ? "+" : ""}
                      {percentChange.toFixed(2)}%
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Explore Sectors Section */}
        <div className="ff-discover-sectors-panel">
          <h2 className="text-2xl font-semibold mb-4">Explore Sectors</h2>
          <div className="ff-discover-sectors-grid grid grid-cols-1 gap-3">
            {loading ? (
              <div className="col-span-full flex items-center justify-center py-12">
                <p className="text-gray-600">Loading sectors...</p>
              </div>
            ) : sectors.length === 0 ? (
              <div className="col-span-full border border-gray-300 rounded-lg px-4 py-4 text-sm text-gray-600 bg-white">
                No sectors found.
              </div>
            ) : (
              sectors.map((sector) => {
                const SectorIcon = getSectorIcon(sector);

                return (
                  <button
                    key={sector}
                    onClick={() => handleSectorClick(sector)}
                    className="h-16 cursor-pointer w-full border border-gray-300 rounded-lg px-4 text-left hover:bg-gray-50 transition-colors flex items-center"
                  >
                    <div className="flex items-center gap-2 text-gray-700">
                      <SectorIcon
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium leading-tight">
                        {sector}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <StockDetailsModal
        open={showStockModal}
        stock={selectedStock}
        onClose={() => setShowStockModal(false)}
      />
      <div className="h-16" />
    </PageContent>
  );
}

export default Discover;
