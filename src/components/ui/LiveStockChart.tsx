
"use client";
import { useEffect, useState, useRef } from "react";
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

type IntradayPoint = {
	time: string;
	price: number;
};

export default function LiveStockChart({ id }: { id: number }) {
	const [data, setData] = useState<IntradayPoint[]>([]);
	const [loading, setLoading] = useState(true);
	const mounted = useRef(true);

	useEffect(() => {
 		mounted.current = true;
 		const fetchIntraday = async () => {
 			setLoading(true);


			// try fetching from the Stock Intraday table; do client-side sorting/filtering
			// fetch today's intraday rows server-side (by timestamp_of)
			const start = new Date();
			start.setHours(0, 0, 0, 0);
			const startISO = start.toISOString();

			const { data: r, error } = await supabase
				.from("Stock Intraday")
				.select("*")
				.eq("stock_id", id)
				.gte("timestamp_of", startISO)
				.order("timestamp_of", { ascending: true })
				.limit(1000);

			let rows: any[] = [];
			if (error) {
				console.error("Error fetching intraday data from 'Stock Intraday':", error);
			} else {
				rows = r ?? [];
			}

			console.log("Raw intraday rows for today:", rows);

			const formatted = rows.map((row: any) => {
				const ts = new Date(row.timestamp_of || row.timestamp || row.time || row.created_at || Date.now());
				const hours = ts.getHours().toString().padStart(2, "0");
				const minutes = ts.getMinutes().toString().padStart(2, "0");
				const time = `${hours}:${minutes}`;
				const price = Number(row.price ?? row.current_price ?? row.close ?? row.value ?? 0);
				return { time, price: Number(price.toFixed(2)) };
			});

			console.log("Formatted intraday data:", formatted);

 			if (mounted.current) {
 				setData(formatted);
 				setLoading(false);
 			}
 		};

 		fetchIntraday();

 		// refresh every 60 seconds while component is mounted
 		const t = setInterval(fetchIntraday, 60_000);
 		return () => {
 			mounted.current = false;
 			clearInterval(t);
 		};
 	}, [id]);

 	if (loading) return <p>Loading live chart…</p>;
 	if (!data.length) return <p>No intraday data for today.</p>;

 	return (
 		<ResponsiveContainer width="100%" height={240}>
 			<AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
 				<defs>
 					<linearGradient id="liveGradient" x1="0" y1="0" x2="0" y2="1">
 						{data[data.length - 1]?.price >= data[0]?.price ? (
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
 				<XAxis dataKey="time" ticks={[data[0]?.time, data[Math.floor(data.length / 2)]?.time, data[data.length - 1]?.time].filter(Boolean)} />
 				<YAxis domain={["auto", "auto"]} />
 				<Tooltip />

 				<Area
 					type="linear"
 					dataKey="price"
 					stroke={data[data.length - 1]?.price >= data[0]?.price ? "#0da70d" : "#ff4d4f"}
 					fill="url(#liveGradient)"
 					dot={false}
 				/>
 			</AreaChart>
 		</ResponsiveContainer>
 	);
}

