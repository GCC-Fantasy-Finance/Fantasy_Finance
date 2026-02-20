import { usePageTitle } from "@/hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useNavigate } from "react-router-dom";

const SECTORS = [
  "Healthcare",
  "Financial",
  "Technology",
  "Energy",
  "Industrial",
  "Communication Services",
  "Consumer Staples",
  "Materials",
  "Consumer Discretionary",
  "Real Estate",
  "Utilities",
];

function Discover() {
  usePageTitle("Discover");
  const navigate = useNavigate();

  const handleSectorClick = (sector: string) => {
    // Convert sector name to URL-friendly format
    const urlFriendlySector = sector.toLowerCase().replace(/\s+/g, "-");
    navigate(`/discover/sector/${urlFriendlySector}`);
  };

  return (
    <PageContent>
      <div className="space-y-8">
        {/* Explore Sectors Section */}
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Explore Sectors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {SECTORS.map((sector) => (
              <button
                key={sector}
                onClick={() => handleSectorClick(sector)}
                className="border border-gray-300 rounded-lg px-4 py-3 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <span className="text-sm font-medium text-gray-700">
                  {sector}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </PageContent>
  );
}

export default Discover;
