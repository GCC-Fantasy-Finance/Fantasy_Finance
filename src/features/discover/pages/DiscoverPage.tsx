import { usePageTitle } from "@/hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useStock } from "@/hooks/useStock";

function Discover() {
  usePageTitle("Discover");
  const { stock, loading, error } = useStock("GOOG");

  return (
    <PageContent>
      {loading ? (
        <p className="text-gray-600">Loading stock data...</p>
      ) : error ? (
        <p className="text-red-600">Error: {error.message ?? String(error)}</p>
      ) : stock ? (
        <div className="flex items-center justify-between border p-4 rounded-md shadow-md">
          <div>
            <p className="text-lg font-bold">{stock.name ?? stock.stock_symbol}</p>
            <p className="text-gray-600">${Number(stock.current_price ?? 0).toFixed(2)}</p>
          </div>
          <button className="text-green-600 border border-green-600 px-3 py-1 rounded">Buy</button>
        </div>
      ) : (
        <p className="text-gray-600">No stock found for GOOG</p>
      )}
    </PageContent>
  );
}

export default Discover;
