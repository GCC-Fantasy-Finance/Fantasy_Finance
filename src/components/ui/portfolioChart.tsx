"use client";
import { useEffect, useState } from "react";

import { getPortfolioHistory } from "@/lib/portfolioHistory";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { fetchPortfolioHoldingsWithStocks } from "@/hooks/fetchPortfolio";
import { supabase } from "@/lib/supabase";
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
  date: string;
  close: number;
};

export default function PortfolioChart({
  id,
}: {
  id: number;
  timeFrame: string;
}) {
  const [data, setData] = useState<Point[]>([]);

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
            close: Number(d.value.toFixed(2)),
          };
        });

      // Fetch current portfolio value and add as live point
      try {
        const { data: portfolio } = await supabase
          .from("Portfolios")
          .select("portfolio_id, reserve_value")
          .eq("portfolio_id", id)
          .single();

        if (portfolio) {
          const { holdings } = await fetchPortfolioHoldingsWithStocks(
            portfolio.portfolio_id
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
            close: Number(currentValue.toFixed(2)),
          });
        }
      } catch (error) {
        console.error("Error fetching current portfolio value:", error);
      }

      setData(formatted);
    };
    try {
      fetchHistory();
    } catch (error) {
      console.error("Error fetching portfolio history:", error);
    }
  }, [id]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
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
        <XAxis dataKey="date" />
        <YAxis domain={["auto", "auto"]} />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip />
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
  );
}
