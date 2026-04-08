"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

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
  date: number; // timestamp in ms
  close: number;
};

export default function StockChart({
  id,
  timeFrame,
}: {
  id: number;
  timeFrame: string;
}) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchHistory = async () => {
      // only show loading if we have no data yet
      if (data.length === 0) setLoading(true);

      try {
        if (timeFrame === "1D") {
          const now = new Date();
          const twoDaysAgo = new Date();
          twoDaysAgo.setDate(now.getDate() - 5); // cover weekends/holidays

          const { data: rows, error } = await supabase
            .from("Stock Intraday")
            .select("price, timestamp_of")
            .eq("stock_id", id)
            .gte("timestamp_of", twoDaysAgo.toISOString())
            .order("timestamp_of", { ascending: true })
            .limit(5000);

          if (error) {
            console.error("Failed fetching intraday:", error);
            if (mounted.current) {
              setData([]);
              setLoading(false);
            }
            return;
          }

          const formatted = (rows ?? []).map((r: any) => {
            const ts = new Date(
              r.timestamp_of ||
                r.timestamp ||
                r.time ||
                r.created_at ||
                Date.now(),
            );
            return {
              date: ts.getTime(),
              close: Number(
                (r.price ?? r.current_price ?? r.close ?? 0).toFixed(2),
              ),
            };
          });

          // ---- GROUP BY DAY ----
          const groupedByDay: Record<string, PricePoint[]> = {};

          formatted.forEach((point) => {
            const d = new Date(point.date);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!groupedByDay[key]) groupedByDay[key] = [];
            groupedByDay[key].push(point);
          });

          const today = new Date();
          const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

          let finalData: PricePoint[] = [];

          if (groupedByDay[todayKey]?.length > 0) {
            finalData = groupedByDay[todayKey];
          } else {
            const latestDay = Object.keys(groupedByDay).sort((a, b) => {
              const aPoints = groupedByDay[a] ?? [];
              const bPoints = groupedByDay[b] ?? [];
              const aLastTs = aPoints[aPoints.length - 1]?.date ?? 0;
              const bLastTs = bPoints[bPoints.length - 1]?.date ?? 0;
              return aLastTs - bLastTs;
            })[Object.keys(groupedByDay).length - 1];
            finalData = groupedByDay[latestDay] ?? [];
          }

          // Before market open, intraday rows can be empty. Fall back to latest daily close
          // and synthesize two points so Recharts can render a visible 1D line.
          if (finalData.length === 0) {
            const { data: lastDaily, error: dailyError } = await supabase
              .from("Stock Histories")
              .select("price, timestamp_of")
              .eq("stock_id", id)
              .order("timestamp_of", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!dailyError && lastDaily?.price != null) {
              const close = Number(Number(lastDaily.price).toFixed(2));
              const nowTs = Date.now();
              finalData = [
                { date: nowTs - 60_000, close },
                { date: nowTs, close },
              ];
            }
          }

          if (mounted.current) {
            setData(finalData);
            setLoading(false);
          }

          return;
        }

        // 30 days or 1 year
        let history: any[] = [];
        if (timeFrame === "1M") history = await getRecentStockHistory(id);
        if (timeFrame === "1Y") history = await getStockHistory(id);

        const formatted = history
          .slice()
          .reverse()
          .map((d: any) => {
            const dateObj = new Date(d.timestamp_of);
            return {
              date: dateObj.getTime(),
              close: Number(d.price.toFixed(2)),
            };
          });

        if (mounted.current) {
          setData(formatted);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error fetching history:", err);
        if (mounted.current) {
          setData([]);
          setLoading(false);
        }
      }
    };

    fetchHistory();

    let t: ReturnType<typeof setInterval> | null = null;
    let channel: any = null;
    if (timeFrame === "1D") {
      // polling
      t = setInterval(fetchHistory, 60_000);

      // realtime subscription for immediate updates
      try {
        channel = supabase
          .channel(`intraday-${id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "Stock Intraday",
              filter: `stock_id=eq.${id}`,
            },
            (payload: any) => {
              const row = payload.new ?? payload.record ?? null;
              if (!row) return;
              const ts = new Date(
                row.timestamp_of ||
                  row.timestamp ||
                  row.time ||
                  row.created_at ||
                  Date.now(),
              ).getTime();
              const point = {
                date: ts,
                close: Number(
                  (row.price ?? row.current_price ?? row.close ?? 0).toFixed(2),
                ),
              };
              // merge into existing data
              setData((prev) => {
                const exists = prev.findIndex((p) => p.date === point.date);
                let next = [] as typeof prev;
                if (exists >= 0) {
                  next = prev.slice();
                  next[exists] = point;
                } else {
                  next = prev.concat(point).sort((a, b) => a.date - b.date);
                }
                return next;
              });
            },
          )
          .subscribe();
      } catch (err) {
        console.error("Realtime subscription failed:", err);
        channel = null;
      }
    }

    return () => {
      mounted.current = false;
      if (t) clearInterval(t);
      if (channel) supabase.removeChannel(channel);
    };
  }, [id, timeFrame]);

  if (loading) return <p>Loading chart…</p>;

  const seenYears = new Set<number>();
  const tickFormatter = (value: number) => {
    const d = new Date(value);
    if (timeFrame === "1D") {
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    }

    const monthDay = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const year = d.getFullYear();

    if (!seenYears.has(year)) {
      seenYears.add(year);
      return `${monthDay}, ${year}`;
    }

    return monthDay;
  };

  return (
    <ResponsiveContainer width="100%" height={290}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
      >
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            {data[data.length - 1]?.close >= data[0]?.close ? (
              <>
                <stop offset="0%" stopColor="#36c719" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#36c719" stopOpacity={0} />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#ff4d4f" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#ff4d4f" stopOpacity={0} />
              </>
            )}
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={tickFormatter}
          tickCount={6}
          tickMargin={12}
          height={42}
          tick={{ fontSize: 13 }}
        />
        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 13 }} />
        <Tooltip
          labelFormatter={(val: any) => {
            const d = new Date(val as number);
            if (timeFrame === "1D")
              return `${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
            return d.toLocaleDateString();
          }}
          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Price"]}
        />

        <Area
          type="linear"
          dataKey="close"
          stroke={
            data[data.length - 1]?.close >= data[0]?.close
              ? "#0da70d"
              : "#ff4d4f"
          }
          fill="url(#lineGradient)"
          dot={false}
          isAnimationActive={true}
          animationDuration={1400}
          animationEasing="ease-in-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
