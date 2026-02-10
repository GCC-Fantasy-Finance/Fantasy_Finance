"use client";
import { useEffect, useState } from "react";

import { getPortfolioHistory } from "@/lib/portfolioHistory";
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

}

export default function PortfolioChart({ id, timeFrame }: { id: number; timeFrame: string }) {
    const [data, setData] = useState<Point[]>([]);
    const [loading, setLoading] = useState(true);
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
            close: d.value.toFixed(2),
        };
    });
            setData(formatted);
            setLoading(false);
        };
        try {
            fetchHistory();
        }
        catch (error) {
            console.error("Error fetching portfolio history:", error);
            setLoading(false);
        }
    }, [id]);


    return (
        <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                <YAxis domain={['auto', 'auto']} />
                <CartesianGrid strokeDasharray="3 3" />
                <Tooltip />
                <Area
                    type="linear"
                    dataKey="close"
                    stroke={data[data.length - 1]?.close >= data[0]?.close ? "#0da70d" : "#ff4d4f"}
                    fillOpacity={1}
                    fill="url(#colorClose)"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}