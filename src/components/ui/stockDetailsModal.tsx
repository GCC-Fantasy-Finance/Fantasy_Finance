import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { useAuth } from "@/context/AuthContext";
import { useChatbot } from "@/context/ChatbotContext";
import { getPortfoliosByUser } from "@/lib/portfolios";
import { getLeagueById } from "@/lib/leagues";
import { getPortfolioHoldingsByPortfolioIdAndStockId } from "@/lib/potfolioHoldings";
import StockChart from "./stockChart";
import{Sparkles} from "lucide-react";
import { getSectorByLeagueId } from "@/lib/leagues";

interface Stock {
  stock_id?: number;
  stock_symbol?: string;
  name?: string;
  current_price?: number;
  sector?: string;
}

interface PortfolioWithLeague {
  portfolio_id: number;
  league_id?: number;
  league_name?: string;
  is_solo: boolean;
  reserve_value: number;
  previous_close_value: number;
  sectors: string[];
}

type Props = {
  open: boolean;
  stock: Stock | null;
  onClose: () => void;
};




export default function StockDetailsModal({ open, stock, onClose }: Props) {
  const { user } = useAuth();
  const { setChatbotState, setIsPinned, setInitialMessage, isPinned } = useChatbot();
  const [portfolios, setPortfolios] = useState<PortfolioWithLeague[]>([]);
  const [loading, setLoading] = useState(false);
  const [holdings, setHoldings] = useState<Record<number, number>>({});
  const [timeFrame, setTimeFrame] = useState("1M");

  /* ================= FETCH DATA ================= */
  useEffect(() => {
    const fetchPortfolios = async () => {
      if (!open || !user?.id) {
        setPortfolios([]);
        setHoldings({});
        return;
      }

      setLoading(true);
      try {
        const userPortfolios = await getPortfoliosByUser(user.id as number);

        const enriched = await Promise.all(
          userPortfolios.map(async (portfolio) => {
            const league_name =
              portfolio.league_id && !portfolio.is_solo
                ? (await getLeagueById(portfolio.league_id))?.name
                : undefined;
            const sectors = 
              portfolio.league_id
                ? await getSectorByLeagueId(portfolio.league_id)
                : [];

            return {
              portfolio_id: portfolio.portfolio_id,
              league_id: portfolio.league_id,
              league_name,
              is_solo: portfolio.is_solo,
              reserve_value: portfolio.reserve_value || 0,
              previous_close_value: portfolio.previous_close_value || 0,
              sectors,
            };
          })
        );

        setPortfolios(enriched);

        if (stock?.stock_id) {
          const map: Record<number, number> = {};
          await Promise.all(
            enriched.map(async (portfolio) => {
              const qty =
                await getPortfolioHoldingsByPortfolioIdAndStockId(
                  portfolio.portfolio_id,
                  stock.stock_id!
                );
              map[portfolio.portfolio_id] = qty ?? 0;
            })
          );
          setHoldings(map);
        }
      } catch (err) {
        console.error("Failed to fetch portfolios:", err);
        setPortfolios([]);
        setHoldings({});
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolios();
  }, [open, user?.id, stock?.stock_id]);

  /* ================= ESC CLOSE ================= */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !stock) return null;

  const handleBuy = (portfolio: PortfolioWithLeague) => {
    // TODO
  };

  const handleSell = (portfolio: PortfolioWithLeague) => {
    // TODO
  };

  const modal = (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isPinned ? "pr-[350px]" : ""}`}>
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* MODAL */}
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-6xl h-[90vh] rounded bg-white shadow-lg flex flex-col"
      >
        {/* CLOSE */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 cursor-pointer"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>

        {/* CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT — CHART */}
          <div className="w-full flex flex-col border-r border-gray-200 p-6">
            <div className="mb-2">
              <h2 className="text-3xl font-semibold">
                {stock.name}{" – "}
                {stock.current_price != null && (
                  <span className="text-green-600">
                    ${stock.current_price.toFixed(2)}
                  </span>
                )}
              </h2>
              <p className="text-gray-600 text-sm">
                {stock.stock_symbol}
              </p>
            </div>

            <div className="flex-1 ">

              <Button className="mx-1 my-[5px] h-[30px] w-16" 
                onClick={() => setTimeFrame("1M")  }
                disabled={timeFrame === "1M"}>
                  30 Days
                
              </Button>
              <Button className="mx-1 my-[5px] h-[30px] w-16" 
                onClick={() => setTimeFrame("1Y")}
                disabled={timeFrame === "1Y"}>
                  Year
              </Button>
              
              <StockChart id={stock.stock_id || 0} timeFrame={timeFrame} />
                
              
            </div>

            


            {/* Ai questions about the stock */}
            <div className=" border-t">
              <button
                className="cursor-pointer mt-2 ml-2 px-2 py-[3px]  text-green-700 rounded hover:bg-green-100 border-green-300 border"
                onClick={() => {
                  setInitialMessage(`Is ${stock.name} (${stock.stock_symbol}) a volatile stock?`);
                  setChatbotState("expanded");
                  setIsPinned(true);
                }}
              >
                <Sparkles className="size-4 inline mb-1 mr-1 text-green-700" />
                 <span>Is this stock volatile?</span> 
                
                 
              </button>
              <button
                className="cursor-pointer mt-2  ml-2 px-2 py-[3px]  text-green-700 rounded hover:bg-green-100 border-green-300 border"
                onClick={() => {
                  setInitialMessage(`What is the future outlook for ${stock.name} (${stock.stock_symbol})?`);
                  setChatbotState("expanded");
                  setIsPinned(true);
                }}
              >
                <Sparkles className="size-4 inline mb-1 mr-1 text-green-700" />
                 <span>What is the future outlook for this stock?</span> 
                
              </button>
              <button
                className="cursor-pointer mt-2 ml-2 px-2 py-[3px]  text-green-700 rounded hover:bg-green-100 border-green-300 border"
                onClick={() => {
                  setInitialMessage(`Tell me more about ${stock.name} (${stock.stock_symbol})?`);
                  setChatbotState("expanded");
                  setIsPinned(true);
                }}
              >
                <Sparkles className="size-4 inline mb-1 mr-1 text-green-700" />
                 <span>Tell me more?</span> 
                
              </button>
            </div>
          </div>

          {/* RIGHT — TRADE + DETAILS */}
          <div className="w-[1000px] flex flex-col border-l border-gray-200 p-6 bg-gray-50">
            <h3 className="text-lg font-semibold mb-4 shrink-0">
              Trade
            </h3>

            {/* SCROLL AREA */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {loading ? (
                <p className="text-gray-500 text-sm">
                  Loading portfolios...
                </p>
              ) : portfolios.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No portfolios found.
                </p>
              ) : (
                portfolios.map((portfolio) => (
                  console.log("stock.sector:", stock.sector),
                  console.log("portfolio.sectors:", portfolio.sectors),
                  <div
                    key={portfolio.portfolio_id}
                    className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between gap-2"
                  >
                    <p className="font-medium text-sm truncate">
                      {portfolio.is_solo
                        ? "Solo"
                        : portfolio.league_name || "Unknown League"}
                    </p>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700">
                        ${portfolio.reserve_value.toFixed(2)}
                      </span>

                      
                        <Button
                          onClick={() => handleSell(portfolio)}
                          variant="outline"
                          disabled={!(holdings[portfolio.portfolio_id] > 0)}
                          className="text-xs h-7 px-2 text-red-600 border-red-300 hover:bg-red-50 disabled:bg-gray-300"
                        >
                          – Sell
                        </Button>
                      

                      

                      <Button

                        onClick={() => handleBuy(portfolio)}
                        disabled={
                          
                          portfolio.reserve_value <= 0 || (!portfolio.sectors.includes("Any")  && !portfolio.sectors.includes(stock.sector || ""))
                        }
                        className="text-xs h-7 px-2 bg-green-700 hover:bg-green-800 text-white disabled:bg-gray-300"
                      >
                        + Buy
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* DETAILS- chart including previous close, day range, year range, market cap, avg, volume */}
            <div className="h-[200px] w-full mt-4 pt-4 border-t border-gray-200 shrink-0">
              <h4 className="text-md font-semibold mb-2">
                Stock Details
              </h4>
              <p className="text-sm text-gray-900">
                <table className="w-full border-separate border-spacing-y-2">
                  <tbody >
                    
                    <tr>
                      <td className="pr-4 font-medium">
                        <span className="relative group ">
                          Previous Close
                          <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-56 rounded bg-green-800 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                            The stock’s closing price from the previous trading day.
                          </span>
                        </span>
                      </td>
                      <td className="text-sm">{stock.previous_close}</td>
                    </tr>

                    <tr>
                      <td className="pr-4 font-medium">
                        <span className="relative group ">
                          Day Range
                          <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-56 rounded bg-green-800 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                            The lowest and highest prices traded today.
                          </span>
                        </span>
                      </td>
                      <td className="text-sm">{stock.day_range}</td>
                    </tr>

                    <tr>
                      <td className="pr-4 font-medium">
                        <span className="relative group ">
                          Year Range
                          <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-56 rounded bg-green-800 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                            The lowest and highest prices over the past year.
                          </span>
                        </span>
                      </td>
                      <td className="text-sm">{stock.year_range}</td>
                    </tr>

                    <tr>
                      <td className="pr-4 font-medium">
                        <span className="relative group ">
                          Market Cap
                          <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-56 rounded bg-green-800 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                            Total market value of all outstanding shares.
                          </span>
                        </span>
                      </td>
                      <td className="text-sm">{stock.market_cap}</td>
                    </tr>

                    <tr>
                      <td className="pr-4 font-medium">
                        <span className="relative group ">
                          Volume
                          <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-56 rounded bg-green-800 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                            Number of shares traded today.
                          </span>
                        </span>
                      </td>
                      <td className="text-sm">{stock.volume}</td>
                    </tr>


                  </tbody>
                </table>

              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
