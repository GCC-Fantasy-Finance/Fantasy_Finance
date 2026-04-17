"use client";
import { useEffect, useMemo, useRef, useState } from "react";

import { getPortfolioHistory } from "@/lib/portfolioHistory";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { fetchPortfolioHoldingsWithStocks } from "@/hooks/fetchPortfolio";
import { supabase } from "@/lib/supabase";
import {
  calculateDayTransactionImpact,
  calculateDollarPnL,
} from "@/lib/transactionImpact";
import DayDetailsModal from "./DayDetailsModal";
import Ticker from "./ticker";
import {
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Area,
} from "recharts";

type Point = {
  xIndex: number;
  date: string;
  timestamp: string;
  close: number;
};

type SelectedPoint = {
  date: string;
  timestamp: string;
  close: number;
  x: number;
  y: number;
  index: number;
};

export default function PortfolioChart({
  id,
}: {
  id: number;
  timeFrame: string;
}) {
  const [data, setData] = useState<Point[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(
    null,
  );
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [dayHoldings, setDayHoldings] = useState<any[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isLoadingHoldings, setIsLoadingHoldings] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    // runs once when the component mounts (i.e. modal opens)
    const fetchHistory = async () => {
      let history = await getPortfolioHistory(id);
      console.log("Fetched portfolio history:", history);
      const formatted = history
        .slice()
        .reverse()
        .map((d: any) => {
          const dateObj = new Date(d.timestamp_of);
          const month = dateObj.toLocaleString("en-US", { month: "short" });
          const day = dateObj.getDate();
          const year = dateObj.getFullYear();
          return {
            date: `${month} ${day}, ${year}`,
            timestamp: d.timestamp_of,
            close: Number(d.value.toFixed(2)),
          };
        });

      // Fetch current portfolio value and add as live point
      try {
        const { data: portfolio } = await supabase
          .from("Portfolios")
          .select("portfolio_id, reserve_value, league_id, user_id")
          .eq("portfolio_id", id)
          .single();

        if (portfolio) {
          setLeagueId(portfolio.league_id);
          setUserId(portfolio.user_id);

          const { holdings } = await fetchPortfolioHoldingsWithStocks(
            portfolio.portfolio_id,
          );

          const currentValue = calculatePortfolioValue({
            holdings: holdings as any,
            reserveValue: portfolio.reserve_value,
          });

          // Add current date data point
          const today = new Date();
          const month = today.toLocaleString("en-US", { month: "short" });
          const day = today.getDate();
          const year = today.getFullYear();

          formatted.push({
            date: `${month} ${day}, ${year}`,
            timestamp: today.toISOString(),
            close: Number(currentValue.toFixed(2)),
          });
        }
      } catch (error) {
        console.error("Error fetching current portfolio value:", error);
      }

      setData(formatted.map((point, index) => ({ ...point, xIndex: index })));
    };
    try {
      fetchHistory();
    } catch (error) {
      console.error("Error fetching portfolio history:", error);
    }
  }, [id]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking on modal elements that are rendered via portal
      const isClickOnModal = (target as HTMLElement).closest(
        ".ff-modal-viewport",
      );

      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !isClickOnModal
      ) {
        setSelectedPoint(null);
      }
    };

    if (selectedPoint) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [selectedPoint]);

  // Fetch holdings for the hovered date in tooltip
  useEffect(() => {
    // Immediately reset holdings when hovering a new point to show skeleton
    if (hoveredIndex !== null && data[hoveredIndex]) {
      setDayHoldings([]);
      setIsLoadingHoldings(true);
    }

    const fetchHoldingsForHoveredDate = async () => {
      if (hoveredIndex === null || !data[hoveredIndex]) {
        setDayHoldings([]);
        setIsLoadingHoldings(false);
        return;
      }

      // Increment request ID for this fetch
      requestIdRef.current += 1;
      const currentRequestId = requestIdRef.current;
      const hoveredPoint = data[hoveredIndex];

      try {
        let selectedDateStr = hoveredPoint.timestamp;
        if (selectedDateStr.includes("+")) {
          selectedDateStr = selectedDateStr.replace(/\+00:00$/, "Z");
        }

        // Get all transactions for this portfolio up to the hovered date
        const { data: transactions } = await supabase
          .from("Transactions")
          .select(
            "stock_id, quantity, transaction_type, created_at, price_per_share",
          )
          .eq("portfolio_id", id)
          .lte("created_at", selectedDateStr);

        // Get all stocks
        const { data: stocks } = await supabase
          .from("Stocks")
          .select("stock_id, stock_symbol, name");

        const stockMap: Record<number, any> = {};
        (stocks || []).forEach((stock: any) => {
          stockMap[stock.stock_id] = stock;
        });

        // Calculate holdings as of hovered date
        const holdingsMap: Record<number, { quantity: number; stock: any }> =
          {};
        const selectedDateUTC = new Date(hoveredPoint.timestamp);
        const selectedDayStart = new Date(
          Date.UTC(
            selectedDateUTC.getUTCFullYear(),
            selectedDateUTC.getUTCMonth(),
            selectedDateUTC.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
        const selectedDayEnd = new Date(selectedDayStart);
        selectedDayEnd.setUTCDate(selectedDayEnd.getUTCDate() + 1);
        selectedDayEnd.setUTCMilliseconds(-1);

        const transactionsOnSelectedDay: Record<number, Array<any>> = {};

        (transactions || []).forEach((txn: any) => {
          const stockId = txn.stock_id;
          const quantity = parseFloat(txn.quantity);
          const type = txn.transaction_type.toUpperCase();
          const txnDate = new Date(txn.created_at);

          if (!holdingsMap[stockId]) {
            holdingsMap[stockId] = { quantity: 0, stock: stockMap[stockId] };
          }

          if (type === "BUY") {
            holdingsMap[stockId].quantity += quantity;
          } else if (type === "SELL") {
            holdingsMap[stockId].quantity -= quantity;
          }

          if (txnDate >= selectedDayStart && txnDate <= selectedDayEnd) {
            if (!transactionsOnSelectedDay[stockId]) {
              transactionsOnSelectedDay[stockId] = [];
            }
            transactionsOnSelectedDay[stockId].push({
              type,
              quantity,
              price: txn.price_per_share,
            });
          }
        });

        // Get stock IDs that are held or traded on hovered day
        const stockIds = Object.keys(holdingsMap)
          .map(Number)
          .filter((stockId) => {
            const currentQuantity = holdingsMap[stockId].quantity;
            const tradedOnDay = !!transactionsOnSelectedDay[stockId];
            return currentQuantity > 0 || tradedOnDay;
          });

        if (stockIds.length === 0) {
          if (currentRequestId === requestIdRef.current) {
            setDayHoldings([]);
            setIsLoadingHoldings(false);
          }
          return;
        }

        // Get prices for hovered date and previous date
        const selectedDayStartForHistory = new Date(
          Date.UTC(
            selectedDateUTC.getUTCFullYear(),
            selectedDateUTC.getUTCMonth(),
            selectedDateUTC.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
        const selectedDayEndForHistory = new Date(selectedDayStartForHistory);
        selectedDayEndForHistory.setUTCDate(
          selectedDayEndForHistory.getUTCDate() + 1,
        );
        selectedDayEndForHistory.setUTCMilliseconds(-1);

        const { data: selectedDayPrices } = await supabase
          .from("Stock Histories")
          .select("stock_id, price")
          .in("stock_id", stockIds)
          .gte("timestamp_of", selectedDayStartForHistory.toISOString())
          .lte("timestamp_of", selectedDayEndForHistory.toISOString())
          .order("timestamp_of", { ascending: false });

        const { data: previousPrices } = await supabase
          .from("Stock Histories")
          .select("stock_id, price")
          .in("stock_id", stockIds)
          .lt("timestamp_of", selectedDayStartForHistory.toISOString())
          .order("timestamp_of", { ascending: false });

        // If no prices for selected day (intraday/today), fetch current prices from Stocks table
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

        // Build holdings list with P&L
        const holdingsList = Object.entries(holdingsMap)
          .filter(([stockId]) => {
            const stockIdNum = Number(stockId);
            return (
              holdingsMap[stockIdNum].quantity > 0 ||
              !!transactionsOnSelectedDay[stockIdNum]
            );
          })
          .map(([stockId, holding]) => {
            const stockIdNum = Number(stockId);
            const tradedToday = !!transactionsOnSelectedDay[stockIdNum];
            const endOfDayPrice = selectedPriceMap[stockIdNum] || 0;
            const previousPrice =
              previousPriceMap[stockIdNum] || endOfDayPrice || 0;

            let dollarPnL = 0;

            if (tradedToday) {
              const dayTransactions = transactionsOnSelectedDay[stockIdNum];
              const txRecords = dayTransactions.map((t: any) => ({
                stock_id: stockIdNum,
                quantity: t.quantity,
                transaction_type: t.type as "BUY" | "SELL",
                created_at: "",
                price_per_share: t.price || 0,
              }));

              const transactionImpact = calculateDayTransactionImpact(
                stockIdNum,
                txRecords,
                endOfDayPrice,
              );
              const pnlCalc = calculateDollarPnL(
                transactionImpact,
                endOfDayPrice,
                previousPrice,
                holding.quantity,
              );
              dollarPnL = pnlCalc.pnl_dollars;
            } else {
              dollarPnL = (endOfDayPrice - previousPrice) * holding.quantity;
            }

            return {
              stock_id: stockIdNum,
              stock_symbol: holding.stock?.stock_symbol || "UNKNOWN",
              stock_name: holding.stock?.name || "Unknown Stock",
              dollarPnL,
            };
          });

        // Sort by absolute dollar change and take top 3
        holdingsList.sort(
          (a, b) => Math.abs(b.dollarPnL) - Math.abs(a.dollarPnL),
        );

        // Only update state if this is still the current request
        if (currentRequestId === requestIdRef.current) {
          setDayHoldings(holdingsList.slice(0, 3));
          setIsLoadingHoldings(false);
        }
      } catch (error) {
        console.error("Error fetching holdings for hovered date:", error);

        // Only update state if this is still the current request
        if (currentRequestId === requestIdRef.current) {
          setDayHoldings([]);
          setIsLoadingHoldings(false);
        }
      }
    };

    fetchHoldingsForHoveredDate();
  }, [hoveredIndex, data, id]);

  const handleChartClick = (state: any) => {
    if (
      state &&
      state.activeTooltipIndex !== undefined &&
      data[state.activeTooltipIndex]
    ) {
      const point = data[state.activeTooltipIndex];
      const event = state.activeCoordinate;
      if (event) {
        setSelectedPoint({
          date: point.date,
          timestamp: point.timestamp,
          close: point.close,
          x: event.x || 0,
          y: event.y || 0,
          index: state.activeTooltipIndex,
        });
      }
    }
  };

  // Custom tooltip with biggest movers FOR THAT DAY based on user's holdings
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const value = payload[0].value;
    const date = payload[0].payload.date;
    const dataIndex = payload[0].dataKey
      ? data.findIndex((d: Point) => d.close === value && d.date === date)
      : -1;

    // Calculate portfolio day change
    let previousDayValue = value;
    if (dataIndex > 0) {
      previousDayValue = data[dataIndex - 1].close;
    }

    return (
      <div className="bg-white border border-gray-300 rounded shadow-lg p-3 z-50 max-w-xs">
        <div className="mb-3 pb-3 border-b border-gray-200">
          <p className="text-sm font-semibold">${value.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{date}</p>
          {/* Portfolio day change ticker */}
          <div className="mt-2 flex items-baseline">
            <Ticker
              currentValue={value}
              previousValue={previousDayValue}
              displayAs="dollar"
              size="small"
              className="mt-0"
            />
          </div>
        </div>

        {/* Show loading state or top 3 movers from that day - only if stocks are owned */}
        {dayHoldings && dayHoldings.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Your Gains/Losses
            </p>
            <div className="space-y-2">
              {dayHoldings.map((holding: any) => {
                const dollarPnL = holding.dollarPnL ?? 0;
                return (
                  <div
                    key={holding.stock_id}
                    className="flex justify-between items-baseline gap-2"
                  >
                    <span className="font-medium text-xs">
                      {holding.stock_symbol}
                    </span>
                    <Ticker
                      currentValue={dollarPnL}
                      previousValue={0}
                      displayAs="dollar"
                      size="small"
                      className="flex-shrink-0"
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
              Click to see more
            </p>
          </div>
        ) : isLoadingHoldings ? (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Your Gains/Losses
            </p>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex justify-between items-baseline gap-2"
                >
                  <div className="h-4 bg-gray-200 rounded w-10"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
              Click to see more
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Your Gains/Losses
            </p>
            <p className="text-xs text-gray-500">No stocks owned</p>
          </div>
        )}
      </div>
    );
  };

  // Handle mouse move on chart to track hovered point
  const handleChartMouseMove = (state: any) => {
    if (state && state.activeTooltipIndex !== undefined) {
      setHoveredIndex(state.activeTooltipIndex);
    }
  };

  // Handle mouse leave to clear hovered point
  const handleChartMouseLeave = () => {
    setHoveredIndex(null);
  };

  const seenYears = new Set<number>();
  const xAxisTickFormatter = (value: number) => {
    const point = data[Math.round(value)];
    if (!point?.date) return "";

    const parsedDate = new Date(point.date);
    if (Number.isNaN(parsedDate.getTime())) return point.date;

    const monthDay = parsedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const year = parsedDate.getFullYear();

    if (!seenYears.has(year)) {
      seenYears.add(year);
      return `${monthDay}, ${year}`;
    }

    return monthDay;
  };

  const xAxisTicks = useMemo(() => {
    const targetLabelCount = 6;
    if (data.length === 0) return [];
    if (data.length === 1) return [0];

    return Array.from({ length: targetLabelCount }, (_, index) =>
      (index * (data.length - 1)) / (targetLabelCount - 1),
    );
  }, [data]);

  return (
    <div ref={containerRef} className="relative w-full cursor-pointer">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
          onClick={handleChartClick}
          onMouseMove={handleChartMouseMove}
          onMouseLeave={handleChartMouseLeave}
        >
          <defs>
            <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
              {/* green gradient for upward trend */}
              {data[data.length - 1]?.close >= data[0]?.close ? (
                <>
                  <stop offset="0%" stopColor="#36c719" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#36c719" stopOpacity={0} />
                </>
              ) : (
                // red gradient for downward trend
                <>
                  <stop offset="0%" stopColor="#ff4d4f" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ff4d4f" stopOpacity={0} />
                </>
              )}
            </linearGradient>
          </defs>
          <XAxis
            dataKey="xIndex"
            type="number"
            domain={[0, Math.max(0, data.length - 1)]}
            tickFormatter={xAxisTickFormatter}
            tickMargin={12}
            height={42}
            tick={{ fontSize: 13 }}
            ticks={xAxisTicks}
            interval={0}
          />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 13 }} />
          <CartesianGrid strokeDasharray="3 3" />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="linear"
            dataKey="close"
            stroke={
              data[data.length - 1]?.close >= data[0]?.close
                ? "#0da70d"
                : "#ff4d4f"
            }
            fillOpacity={1}
            fill="url(#colorClose)"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Day Detail Modal */}
      <DayDetailsModal
        selectedPoint={selectedPoint}
        data={data}
        onClose={() => setSelectedPoint(null)}
        portfolioId={id}
        leagueId={leagueId}
        userId={userId}
      />
    </div>
  );
}
