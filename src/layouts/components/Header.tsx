import { useState, useEffect, useRef } from "react";
import { Menu, Sparkles, X, Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import { useChatbot } from "@/context/ChatbotContext";
import { useNotifications } from "@/context/NotificationsContext";
import { getAllStocks } from "@/lib/stocks";
import { Input } from "@/components/ui/input";
import { useLayout } from "@/context/LayoutContext";
import SearchIcon from "@/components/ui/search-icon";
import { getSearchScore } from "@/lib/searchUtils";

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
  const { toggleSidebar } = useLayout();
  const [query, setQuery] = useState("");
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [results, setResults] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);
  const [showModal, setShowModal] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    chatbotState,
    setChatbotState,
    lastConversationId,
    setIsPinned,
    setResumeRequested,
  } = useChatbot();
  const { notificationsState, setNotificationsState, unreadCount } =
    useNotifications();
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
        const queryLower = query.toLowerCase();
        const filtered = data
          .filter(
            (stock) =>
              stock.name?.toLowerCase().includes(queryLower) ||
              stock.stock_symbol?.toLowerCase().includes(queryLower),
          )
          .sort((a, b) => getSearchScore(b, query) - getSearchScore(a, query));
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
    }, 5000);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchFocused(false);
        if (isMobileSearchOpen) {
          setIsMobileSearchOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileSearchOpen]);

  useEffect(() => {
    if (!isMobileSearchOpen) return;
    mobileSearchInputRef.current?.focus();
  }, [isMobileSearchOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileSearchOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  const handleNotificationsToggle = () => {
    setChatbotState("closed");
    setIsPinned(false);
    setNotificationsState(notificationsState === "closed" ? "open" : "closed");
  };

  const handleChatbotOpen = () => {
    const isMobileScreen = window.matchMedia("(max-width: 1023px)").matches;
    setNotificationsState("closed");
    setResumeRequested(Boolean(lastConversationId));
    setChatbotState("floating");
    setIsPinned(!isMobileScreen);
  };

  return (
    <header
      className="sticky top-0 z-40 isolate flex items-center justify-between"
      aria-label="Page header"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center border-b border-r border-gray-300 bg-white hover:bg-gray-100 md:hidden">
        <button
          type="button"
          aria-label="Open sidebar menu"
          onClick={toggleSidebar}
          className="inline-flex h-full w-full items-center justify-center cursor-pointer"
        >
          <Menu className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      <div className="h-14 bg-white border-b border-gray-300 flex items-center justify-between pl-3 sm:pl-6 w-full gap-3">
        {isMobileSearchOpen ? (
          <div
            ref={searchContainerRef}
            className="relative w-full lg:hidden mr-6"
          >
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10">
              <SearchIcon className="w-4 h-4 text-gray-400" />
            </div>
            <Input
              ref={mobileSearchInputRef}
              type="text"
              placeholder="Search all stocks"
              className="h-9 pl-8 pr-16 shadow-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
            />
            <button
              type="button"
              onClick={() => {
                setIsMobileSearchOpen(false);
                setIsSearchFocused(false);
                setQuery("");
                setResults([]);
              }}
              aria-label="Close search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer z-10"
            >
              <X className="h-4 w-4" />
            </button>
            {isSearchFocused && query.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-b-sm border border-gray-200 bg-white shadow-lg">
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
                        setIsMobileSearchOpen(false);
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
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg sm:text-xl font-medium truncate">
                {title}
              </h1>
            </div>

            <div className="flex items-center gap-4 shrink-0 mr-3">
              <div
                ref={searchContainerRef}
                className="relative hidden lg:block w-64"
              >
                <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10">
                  <SearchIcon className="w-4 h-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Search all stocks"
                  className="h-9 pl-8 pr-8 shadow-none"
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
                {isSearchFocused && query.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-b-sm border border-gray-200 bg-white shadow-lg">
                    {loading && (
                      <div className="p-2 text-sm text-gray-500">
                        Searching...
                      </div>
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
          </>
        )}

        <StockDetailsModal
          open={showModal}
          stock={selectedStock}
          onClose={() => setShowModal(false)}
        />
      </div>

      {!isMobileSearchOpen && (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center border-b border-l border-gray-300 bg-white hover:bg-gray-100 lg:hidden">
          <button
            type="button"
            aria-label="Open search"
            onClick={() => {
              setIsMobileSearchOpen(true);
              setIsSearchFocused(true);
            }}
            className="inline-flex h-full w-full items-center justify-center cursor-pointer"
          >
            <SearchIcon className="w-6 h-6 text-gray-700" />
          </button>
        </div>
      )}

      {/* Notifications Button - hidden only when notifications panel is open */}
      {notificationsState === "closed" && (
        <button
          type="button"
          aria-label="Open notifications"
          onClick={handleNotificationsToggle}
          className="flex h-14 w-14 shrink-0 items-center justify-center border-b border-l border-gray-300 bg-white hover:bg-gray-100 cursor-pointer relative"
        >
          <Bell className="w-6 h-6 text-green-700" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chatbot Button - hidden only when chatbot panel is open */}
      {chatbotState === "closed" && (
        <button
          type="button"
          aria-label={lastConversationId ? "Resume chat" : "Start new AI chat"}
          onClick={handleChatbotOpen}
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-b border-l border-gray-300 bg-white text-sm hover:bg-gray-100 cursor-pointer lg:w-48 lg:items-start lg:px-4"
        >
          <div className="flex gap-1 items-center">
            <Sparkles className="w-6 h-6 lg:w-3 lg:h-3 text-green-700" />
            <p className="hidden lg:block text-green-700 text-xs font-medium">
              {lastConversationId ? "Resume Chat" : "New AI Chat"}
            </p>
          </div>
          <p className="hidden lg:block text-gray-700 text-xs truncate">
            {lastConversationId
              ? conversationTitle || "Loading..."
              : "Ask anything"}
          </p>
        </button>
      )}
    </header>
  );
}
