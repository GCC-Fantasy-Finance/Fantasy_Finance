import { useState, useEffect } from "react";
import { Search, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import { useChatbot } from "@/context/ChatbotContext";
import { getAllStocks } from "@/lib/stocks";

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
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { chatbotState, setChatbotState, lastConversationId, setIsPinned } =
    useChatbot();
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!lastConversationId) {
      setConversationTitle(null);
      return;
    }

    const fetchUniqueTitle = async () => {
      const { data, error } = await supabase
        .from("Chat Conversations")
        .select("title")
        .eq("conversation_id", lastConversationId)
        .single();
      if (!error && data) {
        setConversationTitle(data.title);
      }
    };
    fetchUniqueTitle();
  }, [lastConversationId]);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }

    setLoading(true);

    getAllStocks().then((data) => {
      const filtered = data.filter((stock) =>
        stock.name?.toLowerCase().includes(query.toLowerCase()) ||
        stock.stock_symbol?.toLowerCase().includes(query.toLowerCase()),
      );
      setResults(filtered);
    }).catch((error) => {
      console.error("Error fetching stocks:", error);
      setResults([]);
    }).finally(() => {
      setLoading(false);
    }); 

    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000); // Safety timeout
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="flex items-center justify-between">
      <header className="h-14 bg-white border-b border-gray-300 flex items-center justify-between px-6 w-full">
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
              {!loading &&
                results.map((stock) => (
                  <div
                    key={stock.stock_id}
                    onClick={() => {
                      setSelectedStock(stock);
                      setShowModal(true);
                      setQuery("");
                      setResults([]);
                    }}
                    className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-medium">{stock.name}</div>
                    <div className="text-sm text-gray-600">
                      {stock.stock_symbol} - ${stock.current_price?.toFixed(2)}
                    </div>
                  </div>
                ))}
              {!loading && results.length === 0 && query.length >= 2 && (
                <div className="p-2 text-sm text-gray-500">
                  No stocks found
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stock Details Modal */}
      <StockDetailsModal
        open={showModal}
        stock={selectedStock}
        onClose={() => setShowModal(false)}
      />
    </header>
      {chatbotState === "closed" && lastConversationId && (
        <div
          onClick={() => {
            setChatbotState("expanded");
            setIsPinned(true);
          }}
          className="w-48 flex flex-col gap-0.5 justify-center h-full px-4 text-sm   border-b border-l border-gray-300 hover:bg-gray-100 cursor-pointer"
        >
          <div className="flex gap-1 items-center">
            <Sparkles className="w-3 h-3 text-green-700" />
            <p className="text-green-700 text-xs font-medium">Resume Chat</p>
          </div>
          <p className="text-gray-700 text-xs truncate">
            {conversationTitle || "Loading..."}
          </p>
        </div>
      )}
    </div>
  );
}
