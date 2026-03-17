import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import Ticker from "./ticker";
import StockDetailsModal from "./stockDetailsModal";
import { supabase } from "@/lib/supabase";

type StockHolding = {
  stock_id: number;
  stock_symbol: string;
  stock_name: string;
  quantity: number;
  currentPrice: number;
  previousPrice: number;
  tradedToday: boolean;
  tradedAction?: "BUY" | "SELL";
  avgTradePrice?: number;
  avgSellPrice?: number;
};

type SelectedPoint = {
  date: string;
  timestamp: string;
  close: number;
  index: number;
};

type DayDetailsModalProps = {
  selectedPoint: SelectedPoint | null;
  data: { date: string; close: number }[];
  onClose: () => void;
  portfolioId: number;
  leagueId: number | null;
  userId: string | null;
};

export default function DayDetailsModal({
  selectedPoint,
  data,
  onClose,
  portfolioId,
  leagueId,
  userId,
}: DayDetailsModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [dividends, setDividends] = useState<any[]>([]);

  // Fetch full stock data when a stock is clicked
  const handleStockClick = async (stockId: number, stockSymbol: string, stockName: string, currentPrice: number) => {
    try {
      const { data: stock } = await supabase
        .from("Stocks")
        .select("*")
        .eq("stock_id", stockId)
        .single();

      setSelectedStock(stock || {
        stock_id: stockId,
        stock_symbol: stockSymbol,
        name: stockName,
        current_price: currentPrice,
      });
    } catch (error) {
      // Fallback to basic info if fetch fails
      setSelectedStock({
        stock_id: stockId,
        stock_symbol: stockSymbol,
        name: stockName,
        current_price: currentPrice,
      });
    }
  };

  // Clear selected stock when day details modal closes or reopens
  useEffect(() => {
    if (!selectedPoint) {
      setSelectedStock(null);
    }
  }, [selectedPoint]);

  // ESC + outside click
  useEffect(() => {
    if (!selectedPoint) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    function onMouse(e: MouseEvent) {
      // Don't close day details if stock details modal is open
      if (selectedStock) return;
      
      const target = e.target as Node;
      if (modalRef.current && !modalRef.current.contains(target)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, [selectedPoint, onClose, selectedStock]);

  // Fetch and calculate holdings for the selected date
  useEffect(() => {
    const fetchHoldingsForDate = async () => {
      if (!selectedPoint) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Use the stored timestamp from the chart data for accurate filtering
        // Normalize the timestamp to use Z notation instead of +00:00
        let selectedDateStr = selectedPoint.timestamp;
        if (selectedDateStr.includes("+")) {
          selectedDateStr = selectedDateStr.replace(/\+00:00$/, "Z");
        }
        
        // Get all transactions for this portfolio up to the selected date
        const { data: transactions = [], error: txnError } = await supabase
          .from("Transactions")
          .select("stock_id, quantity, transaction_type, created_at, price_per_share")
          .eq("portfolio_id", portfolioId)
          .lte("created_at", selectedDateStr);

        if (txnError) {
          console.error("Transaction query error:", txnError);
        }

        // Get all stocks to map IDs to symbols and names
        const { data: stocks = [] } = await supabase
          .from("Stocks")
          .select("stock_id, stock_symbol, name");
        
        const stocksArray = stocks || [];
        const stockMap = {
          stock_id: {},
          stock_symbol: {},
          name: {},
        } as any;

        stocksArray.forEach((stock: any) => {
          stockMap.stock_id[stock.stock_id] = stock;
          stockMap.stock_symbol[stock.stock_symbol] = stock;
          stockMap.name[stock.name] = stock;
        });

        // Calculate holdings as of the selected date
        const holdingsMap: Record<number, { quantity: number; stock: any }> = {};
        
        // Parse and create date boundaries for the selected day
        const selectedDateObj = new Date(selectedPoint.timestamp);
        const selectedDateUTC = new Date(Date.UTC(
          selectedDateObj.getUTCFullYear(),
          selectedDateObj.getUTCMonth(),
          selectedDateObj.getUTCDate(),
          0, 0, 0, 0
        ));
        
        // Time boundaries for the selected day (UTC)
        const selectedDayStartForTxns = new Date(selectedDateUTC);
        const selectedDayEndForTxns = new Date(selectedDateUTC);
        selectedDayEndForTxns.setUTCDate(selectedDayEndForTxns.getUTCDate() + 1);
        selectedDayEndForTxns.setUTCMilliseconds(-1);
        
        const transactionsOnSelectedDay: Record<number, Array<{ type: string; quantity: number; price?: number }>> = {};

        const transactionsArray = transactions || [];
        transactionsArray.forEach((txn: any) => {
          const stockId = txn.stock_id;
          const quantity = parseFloat(txn.quantity);
          const type = txn.transaction_type.toUpperCase();
          const txnDate = new Date(txn.created_at);

          if (!holdingsMap[stockId]) {
            holdingsMap[stockId] = { quantity: 0, stock: stockMap.stock_id[stockId] };
          }

          if (type === "BUY") {
            holdingsMap[stockId].quantity += quantity;
          } else if (type === "SELL") {
            holdingsMap[stockId].quantity -= quantity;
          }

          // Track if this transaction happened on the selected day
          if (txnDate >= selectedDayStartForTxns && txnDate <= selectedDayEndForTxns) {
            if (!transactionsOnSelectedDay[stockId]) {
              transactionsOnSelectedDay[stockId] = [];
            }
            transactionsOnSelectedDay[stockId].push({ type, quantity, price: txn.price_per_share });
          }
        });

        // Get stock prices for the selected date and previous date
        const stockIds = Object.keys(holdingsMap)
          .map(Number)
          .filter(stockId => holdingsMap[stockId].quantity > 0);

        if (stockIds.length === 0) {
          setHoldings([]);
          setLoading(false);
          return;
        }

        // Parse date properly for stock history queries
        const dateForHistory = new Date(selectedPoint.timestamp);
        const selectedDayStartForHistory = new Date(Date.UTC(
          dateForHistory.getUTCFullYear(),
          dateForHistory.getUTCMonth(),
          dateForHistory.getUTCDate(),
          0, 0, 0, 0
        ));
        
        const selectedDayEndForHistory = new Date(selectedDayStartForHistory);
        selectedDayEndForHistory.setUTCDate(selectedDayEndForHistory.getUTCDate() + 1);
        selectedDayEndForHistory.setUTCMilliseconds(-1);

        // Get price on selected date (most recent one that day)
        const { data: selectedDayPrices = [] } = await supabase
          .from("Stock Histories")
          .select("stock_id, price")
          .in("stock_id", stockIds)
          .gte("timestamp_of", selectedDayStartForHistory.toISOString())
          .lte("timestamp_of", selectedDayEndForHistory.toISOString())
          .order("timestamp_of", { ascending: false });

        // Get most recent price before the selected date (handles weekends/holidays)
        const { data: previousPrices = [] } = await supabase
          .from("Stock Histories")
          .select("stock_id, price")
          .in("stock_id", stockIds)
          .lt("timestamp_of", selectedDayStartForHistory.toISOString())
          .order("timestamp_of", { ascending: false });

        // If no prices for selected day (intraday), fetch current prices from Stocks table
        let selectedDayPricesForMap = selectedDayPrices;
        if (!selectedDayPrices || selectedDayPrices.length === 0) {
          const { data: currentPrices = [] } = await supabase
            .from("Stocks")
            .select("stock_id, current_price")
            .in("stock_id", stockIds);
          
          // Convert to same format as Stock Histories
          selectedDayPricesForMap = (currentPrices || []).map((stock: any) => ({
            stock_id: stock.stock_id,
            price: stock.current_price,
          }));
        }

        // Create price maps - take the first (most recent) price per stock for each day
        const selectedPriceMap: Record<number, number> = {};
        const previousPriceMap: Record<number, number> = {};

        (selectedDayPricesForMap || []).forEach((entry: any) => {
          if (!selectedPriceMap[entry.stock_id]) {
            selectedPriceMap[entry.stock_id] = entry.price;
          }
        });

        (previousPrices || []).forEach((entry: any) => {
          if (!previousPriceMap[entry.stock_id]) {
            previousPriceMap[entry.stock_id] = entry.price;
          }
        });

        // Convert to array and filter out stocks with 0 quantity
        const holdingsList: StockHolding[] = Object.entries(holdingsMap)
          .filter(([_, holding]) => holding.quantity > 0)
          .map(([stockId, holding]) => {
            const stockIdNum = Number(stockId);
            const tradedToday = !!transactionsOnSelectedDay[stockIdNum];
            
            let tradedAction: "BUY" | "SELL" | undefined;
            let avgTradePrice: number | undefined;
            let avgSellPrice: number | undefined;
            
            if (tradedToday) {
              const dayTransactions = transactionsOnSelectedDay[stockIdNum];
              // Determine primary action (if mixed, prioritize BUY)
              const hasBuy = dayTransactions.some(t => t.type === "BUY");
              tradedAction = hasBuy ? "BUY" : "SELL";
              
              // If bought today, use the average buy price as comparison point
              if (tradedAction === "BUY") {
                const buyTransactions = dayTransactions.filter(t => t.type === "BUY");
                const totalBuyCost = buyTransactions.reduce((sum, t) => sum + ((t.price || 0) * (t.quantity || 0)), 0);
                const totalBuyQuantity = buyTransactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
                avgTradePrice = totalBuyQuantity > 0 ? totalBuyCost / totalBuyQuantity : undefined;
              } else if (tradedAction === "SELL") {
                // For sold today, use the average sell price
                const sellTransactions = dayTransactions.filter(t => t.type === "SELL");
                const totalSellCost = sellTransactions.reduce((sum, t) => sum + ((t.price || 0) * (t.quantity || 0)), 0);
                const totalSellQuantity = sellTransactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
                avgSellPrice = totalSellQuantity > 0 ? totalSellCost / totalSellQuantity : undefined;
              }
            }
            
            return {
              stock_id: stockIdNum,
              stock_symbol: holding.stock?.stock_symbol || "UNKNOWN",
              stock_name: holding.stock?.name || "Unknown Stock",
              quantity: holding.quantity,
              currentPrice: selectedPriceMap[stockIdNum] || 0,
              previousPrice: avgTradePrice || previousPriceMap[stockIdNum] || selectedPriceMap[stockIdNum] || 0,
              tradedToday,
              tradedAction,
              avgTradePrice,
              avgSellPrice,
            };
          });

        setHoldings(holdingsList);
      } catch (error) {
        console.error("Error fetching holdings for date:", error);
        setHoldings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHoldingsForDate();
  }, [selectedPoint, portfolioId]);

  // Fetch dividends for the selected date
  useEffect(() => {
    const fetchDividends = async () => {
      if (!selectedPoint || !userId) {
        setDividends([]);
        return;
      }

      try {
        // Parse date for dividend query
        const dateForDividends = new Date(selectedPoint.timestamp);
        const selectedDayStart = new Date(Date.UTC(
          dateForDividends.getUTCFullYear(),
          dateForDividends.getUTCMonth(),
          dateForDividends.getUTCDate(),
          0, 0, 0, 0
        ));
        
        const selectedDayEnd = new Date(selectedDayStart);
        selectedDayEnd.setUTCDate(selectedDayEnd.getUTCDate() + 1);
        selectedDayEnd.setUTCMilliseconds(-1);

        // Query dividends from Notifications table
        // Include dividends for the specific league (if in a league) OR where league_id is null (applies to solo/all)
        let query = supabase
          .from("Notifications")
          .select("*")
          .eq("user_id", userId)
          .eq("category", "Dividend")
          .gte("created_at", selectedDayStart.toISOString())
          .lte("created_at", selectedDayEnd.toISOString());

        // If in a league, include dividends for this league OR global dividends (null league_id)
        // If not in a league (solo), only include global dividends (null league_id)
        if (leagueId) {
          query = query.or(`league_id.eq.${leagueId},league_id.is.null`);
        } else {
          query = query.is("league_id", null);
        }

        const { data: dividendNotifications = [], error } = await query;

        if (error) {
          console.error("Error fetching dividends:", error);
          setDividends([]);
          return;
        }

        setDividends(dividendNotifications || []);
      } catch (error) {
        console.error("Error in dividend fetch:", error);
        setDividends([]);
      }
    };

    fetchDividends();
  }, [selectedPoint, leagueId, userId]);

  if (!selectedPoint) return null;

  const modal = (
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl rounded bg-white shadow-lg max-h-[70vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-transparent">
          <div className="flex flex-col">
            <div className="text-xs text-gray-500 mb-1">{selectedPoint.date}</div>
            {selectedPoint.index > 0 ? (
              <div>
                <Ticker
                  currentValue={selectedPoint.close}
                  previousValue={data[selectedPoint.index - 1]?.close}
                  displayAs="percent"
                  dollarAmount
                  size="large"
                />
              </div>
            ) : (
              <div className="text-lg font-bold">${selectedPoint.close.toFixed(2)}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Holdings List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
              <p className="text-sm text-gray-500">Loading holdings...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Dividends Section */}
              {dividends && dividends.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                  <h3 className="text-xs font-semibold text-green-900 mb-2">Dividends Received</h3>
                  <div className="space-y-1">
                    {dividends.map((dividend, idx) => (
                      <div key={idx} className="text-sm text-green-800">
                        {dividend.message || "Dividend paid"}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Holdings */}
              {holdings.length > 0 ? (
                <div className="space-y-2">
                  {holdings.map((holding) => {
                const totalValue = holding.quantity * holding.currentPrice;
                const previousTotalValue = holding.quantity * holding.previousPrice;

                return (
                  <div
                    key={holding.stock_id}
                    className="p-3 bg-gray-50 rounded border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleStockClick(holding.stock_id, holding.stock_symbol, holding.stock_name, holding.currentPrice)}
                  >
                    {/* Top row: symbol and badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-semibold text-sm">{holding.stock_symbol}</p>
                      {holding.tradedToday && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          holding.tradedAction === "BUY" 
                            ? "bg-green-100 text-green-700" 
                            : "bg-green-100 text-green-700"
                        }`}>
                          {holding.tradedAction === "BUY" ? "Bought" : "Sold"} today
                        </span>
                      )}
                    </div>
                    
                    {/* Main row: shares and change */}
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Shares</div>
                        <p className="font-bold text-lg">{holding.quantity.toFixed(2)}</p>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Change</div>
                        {holding.tradedToday && holding.tradedAction === "BUY" && holding.avgTradePrice ? (
                          <Ticker
                            currentValue={holding.currentPrice}
                            previousValue={holding.avgTradePrice}
                            displayAs="percent"
                            dollarAmount
                            size="small"
                          />
                        ) : holding.tradedToday && holding.tradedAction === "SELL" && holding.avgSellPrice ? (
                          <Ticker
                            currentValue={holding.avgSellPrice}
                            previousValue={holding.previousPrice}
                            displayAs="percent"
                            dollarAmount
                            size="small"
                          />
                        ) : (
                          <Ticker
                            currentValue={totalValue}
                            previousValue={previousTotalValue}
                            displayAs="percent"
                            dollarAmount
                            size="small"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {ReactDOM.createPortal(modal, document.body)}
      <StockDetailsModal
        open={!!selectedStock}
        stock={selectedStock}
        onClose={() => setSelectedStock(null)}
      />
    </>
  );
}
