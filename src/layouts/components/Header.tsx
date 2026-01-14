import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface StockRow {
  stock_id?: number;
  stock_symbol?: string;
  name?: string;
  current_price?: number;
}

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("Stocks")
        .select("stock_id, stock_symbol, name, current_price")
        .or(`name.ilike.%${query}%,stock_symbol.ilike.%${query}%`)
        .limit(10);

      if (error) {
        console.error("Search error:", error);
        setResults([]);
      } else {
        setResults(data || []);
      }
      setLoading(false);
    };

    const timeout = setTimeout(fetchResults, 300); // Debounce search
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <header className="h-14 bg-white border-b border-gray-300 flex items-center justify-between px-6">
      {/* Page Title */}
      <h1 className="text-xl font-medium">{title}</h1>

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative w-96">
          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search all stocks"
            className="w-full pl-9 pr-4 py-1 text-sm bg-gray-100 border border-gray-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/* Search Results Dropdown */}
          {(results.length > 0 || loading) && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-sm shadow-lg z-10 max-h-60 overflow-y-auto">
              {loading && (
                <div className="p-2 text-sm text-gray-500">Searching...</div>
              )}
              {!loading && results.map((stock) => (
                <div key={stock.stock_id} className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                  <div className="font-medium">{stock.name}</div>
                  <div className="text-sm text-gray-600">{stock.stock_symbol} - ${stock.current_price?.toFixed(2)}</div>
                </div>
              ))}
              {!loading && results.length === 0 && query.length >= 2 && (
                <div className="p-2 text-sm text-gray-500">No stocks found</div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
