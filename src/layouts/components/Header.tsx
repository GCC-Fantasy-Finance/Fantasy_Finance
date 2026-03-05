import { useState, useEffect, useRef } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import { useChatbot } from "@/context/ChatbotContext";
import { getAllStocks } from "@/lib/stocks";
import { Input } from "@/components/ui/input";

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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);
  const [showModal, setShowModal] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const {
    chatbotState,
    setChatbotState,
    lastConversationId,
    setIsPinned,
    setResumeRequested,
  } = useChatbot();
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

    getAllStocks()
      .then((data) => {
        const filtered = data.filter(
          (stock) =>
            stock.name?.toLowerCase().includes(query.toLowerCase()) ||
            stock.stock_symbol?.toLowerCase().includes(query.toLowerCase()),
        );
        setResults(filtered);
      })
      .catch((error) => {
        console.error("Error fetching stocks:", error);
        setResults([]);
      })
      .finally(() => {
        setLoading(false);
      });

    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000); // Safety timeout
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center justify-between">
      <header className="h-14 bg-white border-b border-gray-300 flex items-center justify-between px-6 w-full">
        {/* Page Title */}
        <h1 className="text-xl font-medium">{title}</h1>

        {/* Search Bar */}
        <div className="flex items-center gap-4">
          <div ref={searchContainerRef} className="relative w-96">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10">
              <Search className="w-4 h-4 text-gray-400" />
            </div>
            <Input
              type="text"
              placeholder="Search all stocks"
              className="h-9 pl-8 pr-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer z-10"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Search Results Dropdown */}
            {isSearchFocused && query.length > 0 && (
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
                        setIsSearchFocused(false);
                      }}
                      className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium">{stock.name}</div>
                      <div className="text-sm text-gray-600">
                        {stock.stock_symbol} - $
                        {stock.current_price?.toFixed(2)}
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
      {chatbotState === "closed" && (
        <div
          onClick={() => {
            setResumeRequested(Boolean(lastConversationId));
            setChatbotState("floating");
            setIsPinned(true);
          }}
          className="w-48 flex flex-col gap-0.5 justify-center h-full px-4 text-sm   border-b border-l border-gray-300 hover:bg-gray-100 cursor-pointer"
        >
          <div className="flex gap-1 items-center">
            <Sparkles className="w-3 h-3 text-green-700" />
            <p className="text-green-700 text-xs font-medium">
              {lastConversationId ? "Resume Chat" : "New Chat"}
            </p>
          </div>
          <p className="text-gray-700 text-xs truncate">
            {lastConversationId
              ? conversationTitle || "Loading..."
              : "Start a new conversation"}
          </p>
        </div>
      )}
    </div>
  );
}
