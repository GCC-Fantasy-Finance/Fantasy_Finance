"use client";
import { useEffect, useState } from "react";

import { getRecentStockHistory, getStockHistory } from "@/lib/stockHistory";
import {
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Area,
} from "recharts";



type PricePoint = {
  date: string;
  close: number;
};

export default function StockChart({ id, timeFrame }: { id: number, timeFrame: string }) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // runs once when the component mounts (i.e. modal opens)
    const fetchHistory = async () => {

      let history = [];
      if(timeFrame === "1M"){
        history = await getRecentStockHistory(id);
      }
      if (timeFrame === "1Y"){
        history = await getStockHistory(id);
      }
      
      console.log("Fetched stock history:", history);
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
      close: Number(d.price.toFixed(2)),
    };
  });


      setData(formatted);
      setLoading(false);
    };
    console.log("STOCK CHART DATA:", data);


    fetchHistory();
  }, [id, timeFrame]);

  if (loading) return <p>Loading chart…</p>;

  return (
    <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#36c719" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#36c719" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" 
        ticks={[
        data[0]?.date,                       
        data[Math.floor(data.length / 2)]?.date, 
        data[data.length - 1]?.date          
      ].filter(Boolean)}/>
        <YAxis domain={['auto', 'auto']} />
        <Tooltip />

        <Area
          type="linear"       
          dataKey="close"
          stroke="#36c719"       
          fill="url(#lineGradient)" 
          dot={false}
        />
      </AreaChart>

     
    </ResponsiveContainer>
  );
}
