"use client";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import {
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Line,
} from "recharts";

type PortfolioData = {
  portfolio_id: number;
  username: string;
};

type TooltipProps = {
  active?: boolean;
  payload?: any[];
  label?: string;
};

const RankedTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Sort payload by value (highest first)
  const sortedPayload = [...payload].sort((a, b) => {
    const valueA = typeof a.value === "number" ? a.value : 0;
    const valueB = typeof b.value === "number" ? b.value : 0;
    return valueB - valueA;
  });

  return (
    <div
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "10px",
      }}
    >
      <p style={{ margin: "0 0 8px 0", fontWeight: "bold", fontSize: "12px" }}>
        {label}
      </p>
      {sortedPayload.map((entry, index) => (
        <p
          key={entry.dataKey}
          style={{
            margin: "4px 0",
            fontSize: "12px",
            color: entry.color || "#999999",
          }}
        >
          <span style={{ fontWeight: "bold", marginRight: "8px" }}>
            #{index + 1}
          </span>
          {entry.name}: ${typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
        </p>
      ))}
    </div>
  );
};

type ChartDataPoint = {
  date: string;
  [key: string]: string | number; // username: value
};

type LeaderboardEntry = {
  portfolio_id: number;
  username: string;
  live_value: number;
};

export default function LeaguePortfolioChart({
  portfolios,
  currentUserPortfolioId,
  leaderboard,
  endDate,
}: {
  portfolios: PortfolioData[];
  currentUserPortfolioId?: number;
  leaderboard?: LeaderboardEntry[];
  endDate?: string; // ISO date string (YYYY-MM-DD)
}) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllHistories = async () => {
      try {
        setLoading(true);
        const portfolioIds = portfolios.map((p) => p.portfolio_id);

        if (portfolioIds.length === 0) {
          setData([]);
          return;
        }

        // Fetch all portfolio histories
        const { data: historyRows, error } = await supabase
          .from("Portfolio Histories")
          .select("portfolio_id,value,timestamp_of")
          .in("portfolio_id", portfolioIds)
          .order("timestamp_of", { ascending: true });

        if (error) {
          console.error("Error fetching portfolio histories:", error);
          setData([]);
          return;
        }

        // Helper to format date as "Month Day, Year"
        const formatDate = (date: Date) => {
          const month = date.toLocaleString("en-US", { month: "short" });
          const day = date.getDate();
          const year = date.getFullYear();
          return `${month} ${day}, ${year}`;
        };

        // Helper to get ISO date string (YYYY-MM-DD)
        const getIsoDate = (date: Date) => date.toISOString().split('T')[0];

        // Group data by date
        const dataByDate = new Map<string, ChartDataPoint>();

        if (historyRows) {
          for (const row of historyRows as any[]) {
            const dateObj = new Date(row.timestamp_of);
            const dateStr = formatDate(dateObj);
            const isoDate = getIsoDate(dateObj);

            // Skip if date is after league end date
            if (endDate && isoDate > endDate) continue;

            if (!dataByDate.has(dateStr)) {
              dataByDate.set(dateStr, { date: dateStr });
            }

            const portfolioData = portfolios.find(
              (p) => p.portfolio_id === Number(row.portfolio_id)
            );
            if (portfolioData) {
              dataByDate.get(dateStr)![portfolioData.username] = Number(
                row.value.toFixed(2)
              );
            }
          }
        }

        // Convert to array and sort by date
        let chartData = Array.from(dataByDate.values()).sort((a, b) => {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        // Add today's leaderboard values as the latest data point if provided
        if (leaderboard && leaderboard.length > 0) {
          const today = new Date();
          const todayStr = formatDate(today);
          const todayIsoDate = getIsoDate(today);

          // Only add if it's on or before the league end date
          if (!endDate || todayIsoDate <= endDate) {
            const todayDataPoint: ChartDataPoint = { date: todayStr };
            for (const entry of leaderboard) {
              todayDataPoint[entry.username] = Number(entry.live_value.toFixed(2));
            }
            chartData.push(todayDataPoint);
          }
        }

        setData(chartData);
      } catch (error) {
        console.error("Error processing portfolio histories:", error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllHistories();
  }, [portfolios, leaderboard, endDate]);

  if (loading) {
    return <div className="text-center py-8">Loading portfolio data...</div>;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No portfolio history data available
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date"  textAnchor="end" height={80} />
          <YAxis domain={["auto", "auto"]} />
          <Tooltip content={<RankedTooltip />} />
          {portfolios.map((portfolio) => (
            <Line
              key={portfolio.portfolio_id}
              type="linear"
              dataKey={portfolio.username}
              stroke={
                portfolio.portfolio_id === currentUserPortfolioId
                  ? "#0da70d"
                  : "#999999"
              }
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
