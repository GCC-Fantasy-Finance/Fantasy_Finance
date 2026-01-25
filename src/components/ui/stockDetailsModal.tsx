import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { useAuth } from "@/context/AuthContext";
import { getPortfoliosByUser } from "@/lib/portfolios";
import { getLeagueById, type LeagueRow } from "@/lib/leagues";

interface Stock {
  stock_id?: number;
  stock_symbol?: string;
  name?: string;
  current_price?: number;
}

interface PortfolioWithLeague {
  portfolio_id: number;
  league_id?: number;
  league_name?: string;
  is_solo: boolean;
  reserve_value: number;
  total_value: number;
}

type Props = {
  open: boolean;
  stock: Stock | null;
  onClose: () => void;
};

export default function StockDetailsModal({ open, stock, onClose }: Props) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [portfolios, setPortfolios] = useState<PortfolioWithLeague[]>([]);
  const [loading, setLoading] = useState(false);

  // --- Fetch user's portfolios and enrich with league names ---
  useEffect(() => {
    const fetchPortfolios = async () => {
      if (!open || !user?.id) {
        setPortfolios([]);
        return;
      }

      setLoading(true);
      try {
        // Get all portfolios for this user
        const userPortfolios = await getPortfoliosByUser(user.id as any);

        if (!userPortfolios || userPortfolios.length === 0) {
          setPortfolios([]);
          setLoading(false);
          return;
        }

        // Enrich league portfolios with league names
        const enrichedPortfolios = await Promise.all(
          userPortfolios.map(async (portfolio: any) => {
            let league_name: string | undefined;

            // If it's a league portfolio, fetch the league name
            if (portfolio.league_id && !portfolio.is_solo) {
              const league = await getLeagueById(portfolio.league_id);
              league_name = league?.name;
            }

            return {
              portfolio_id: portfolio.portfolio_id,
              league_id: portfolio.league_id,
              league_name: league_name,
              is_solo: portfolio.is_solo,
              reserve_value: portfolio.reserve_value || 0,
              total_value: portfolio.total_value || 0,
            } as PortfolioWithLeague;
          })
        );

        setPortfolios(enrichedPortfolios);
      } catch (err) {
        console.error("Failed to fetch portfolios:", err);
        setPortfolios([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolios();
  }, [open, user?.id]);

  // --- ESC key close ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    if (open) {
      document.addEventListener("keydown", onKey);
    }

    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !stock) return null;

  const totalCost = (stock.current_price || 0) * quantity;

  const handleBuy = (portfolio: PortfolioWithLeague) => {
    const context = portfolio.is_solo
      ? "Solo Portfolio"
      : portfolio.league_name || "Unknown League";
    console.log(
      `Buy ${quantity} shares of ${stock.stock_symbol} for portfolio ${portfolio.portfolio_id} (${context})`
    );
    // TODO: Implement actual buyStock function call
  };

  const handleSell = (portfolio: PortfolioWithLeague) => {
    const context = portfolio.is_solo
      ? "Solo Portfolio"
      : portfolio.league_name || "Unknown League";
    console.log(
      `Sell ${quantity} shares of ${stock.stock_symbol} from portfolio ${portfolio.portfolio_id} (${context})`
    );
    // TODO: Implement actual sellStock function call
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-6xl h-[90vh] rounded bg-white shadow-lg flex flex-col"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 z-10"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Main Content Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column - Stock Info & Chart */}
          <div className="flex-1 flex flex-col border-r border-gray-200 p-6 overflow-auto">
            {/* Header */}
            <div className="mb-4">
              <h2 className="text-3xl font-semibold">{stock.name}</h2>
              <p className="text-gray-600">{stock.stock_symbol}</p>
            </div>

            {/* Price Section */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-700 font-medium">Current Price</span>
                <span className="text-3xl font-bold text-green-700">
                  ${stock.current_price?.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Chart Placeholder */}
            <div className="flex-1 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <div className="text-center text-gray-500">
                <p className="text-lg font-medium">Price Chart</p>
                <p className="text-sm">Graph will appear here</p>
              </div>
            </div>
          </div>

          {/* Right Column - Trade Options */}
          <div className="w-80 flex flex-col border-l border-gray-200 p-6 overflow-hidden">
            <h3 className="text-xl font-semibold mb-4">Trade</h3>

            {/* Quantity Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Quantity</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded font-semibold text-sm"
                >
                  −
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-center font-semibold text-sm"
                  min="1"
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded font-semibold text-sm"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Total: ${totalCost.toFixed(2)}
              </p>
            </div>

            {/* Portfolios Section */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="text-sm font-medium mb-2">Select Portfolio</label>

              {loading ? (
                <p className="text-gray-500 text-sm">Loading portfolios...</p>
              ) : portfolios.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No portfolios found.
                </p>
              ) : (
                <div className="overflow-y-auto flex-1 space-y-2">
                  {portfolios.map((portfolio) => (
                    <div
                      key={portfolio.portfolio_id}
                      className="border border-gray-200 rounded p-3 hover:bg-gray-50 transition"
                    >
                      <div className="mb-2">
                        <p className="font-medium text-sm truncate">
                          {portfolio.is_solo
                            ? "Solo Portfolio"
                            : portfolio.league_name || "Unknown League"}
                        </p>
                        <p className="text-xs text-gray-600">
                          Reserve: ${portfolio.reserve_value.toFixed(2)}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleSell(portfolio)}
                          variant="outline"
                          className="flex-1 text-xs py-1 text-red-600 border-red-300 hover:bg-red-50 h-8"
                        >
                          Sell
                        </Button>
                        <Button
                          onClick={() => handleBuy(portfolio)}
                          className="flex-1 text-xs py-1 bg-green-700 hover:bg-green-800 text-white h-8"
                        >
                          Buy
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
