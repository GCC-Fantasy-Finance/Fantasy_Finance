"use client";
import { useEffect, useState, useRef } from "react";

import { getPortfolioHistory } from "@/lib/portfolioHistory";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { fetchPortfolioHoldingsWithStocks } from "@/hooks/fetchPortfolio";
import { supabase } from "@/lib/supabase";
import DayDetailsModal from "./DayDetailsModal";
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
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
            timestamp: today.toISOString(),
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

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking on modal elements that are rendered via portal
      const isClickOnModal = (target as HTMLElement).closest(".ff-modal-viewport");
      
      if (containerRef.current && !containerRef.current.contains(target) && !isClickOnModal) {
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

  const handleChartClick = (state: any) => {
    if (state && state.activeTooltipIndex !== undefined && data[state.activeTooltipIndex]) {
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

  return (
    <div ref={containerRef} className="relative w-full">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          onClick={handleChartClick}
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
