import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useNavigate } from "react-router-dom";
import { getAllStocks } from "@/lib/stocks";

type StockWithSector = {
  sector?: string | null;
};

function toSectorSlug(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}

function Discover() {
  usePageTitle("Discover");
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockWithSector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadStocks() {
      setLoading(true);
      try {
        const allStocks = (await getAllStocks()) as StockWithSector[];
        if (mounted) {
          setStocks(allStocks);
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

  const handleSectorClick = (sector: string) => {
    const urlFriendlySector = toSectorSlug(sector);
    navigate(`/discover/sector/${urlFriendlySector}`);
  };

  return (
    <PageContent>
      <div className="space-y-8">
        {/* Explore Sectors Section */}
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Explore Sectors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {loading ? (
              <div className="sm:col-span-2 lg:col-span-5 border border-gray-300 rounded-lg px-4 py-4 text-sm text-gray-600 bg-white">
                Loading sectors...
              </div>
            ) : sectors.length === 0 ? (
              <div className="sm:col-span-2 lg:col-span-5 border border-gray-300 rounded-lg px-4 py-4 text-sm text-gray-600 bg-white">
                No sectors found.
              </div>
            ) : (
              sectors.map((sector) => (
                <button
                  key={sector}
                  onClick={() => handleSectorClick(sector)}
                  className="h-16 w-full border border-gray-300 rounded-lg px-4 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent flex items-center"
                >
                  <span className="text-sm font-medium text-gray-700 leading-tight">
                    {sector}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </PageContent>
  );
}

export default Discover;
