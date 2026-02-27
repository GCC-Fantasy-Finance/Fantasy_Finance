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

type ChartDataPoint = {
  date: string;
  [key: string]: string | number; // username: value
};

export default function LeaguePortfolioChart({
  portfolios,
  currentUserPortfolioId,
}: {
  portfolios: PortfolioData[];
  currentUserPortfolioId?: number;
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

        // Group data by date
        const dataByDate = new Map<string, any>();

        if (historyRows) {
          for (const row of historyRows as any[]) {
            const dateObj = new Date(row.timestamp_of);
            const month = dateObj.toLocaleString("en-US", { month: "short" });
            const day = dateObj.getDate();
            const year = dateObj.getFullYear();
            const dateStr = `${month} ${day}, ${year}`;

            if (!dataByDate.has(dateStr)) {
              dataByDate.set(dateStr, { date: dateStr });
            }

            const portfolioData = portfolios.find(
              (p) => p.portfolio_id === Number(row.portfolio_id)
            );
            if (portfolioData) {
              dataByDate.get(dateStr)[portfolioData.username] = Number(
                row.value.toFixed(2)
              );
            }
          }
        }

        // Convert to array and sort by date
        const chartData = Array.from(dataByDate.values()).sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateA.getTime() - dateB.getTime();
        });

        setData(chartData);
      } catch (error) {
        console.error("Error processing portfolio histories:", error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllHistories();
  }, [portfolios]);

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
          <Tooltip
            formatter={(value: any) => {
              if (typeof value === "number") {
                return `$${value.toFixed(2)}`;
              }
              return value;
            }}
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />
          {portfolios.map((portfolio, index) => (
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
