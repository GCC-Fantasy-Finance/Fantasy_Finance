import {
  Fragment,
  type ReactNode,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { Link } from "react-router-dom";
import {
  X,
  Send,
  Pin,
  History,
  ArrowLeft,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Stars,
  ArrowUpRight,
  Paperclip,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "./button";
import { Input } from "./input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Checkbox } from "./checkbox";
import AIQuestionChip from "./AIQuestionChip";
import { useAuth } from "@/context/AuthContext";
import { useChatbot } from "@/context/ChatbotContext";
import { supabase } from "@/lib/supabase";
import {
  createConversation,
  addMessage,
  getUserConversations,
  getConversationMessages,
  callOpenAIStream,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/chat";
import SearchIcon from "@/components/ui/search-icon";
import { useNotifications } from "@/context/NotificationsContext";

interface ChatbotProps {
  disabled?: boolean;
  isPinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
}

// type ChatbotState = "closed" | "floating";
type ViewMode = "chat" | "history";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  contextPortfolioNames?: string[];
  contextPortfolioIds?: number[];
}

interface PortfolioContextOption {
  id: number;
  name: string;
  isSolo: boolean;
  leagueId: number | null;
  group: "personal" | "current" | "ended";
}

interface PortfolioContextSnapshot {
  selectedAt: string;
  portfolioCount: number;
  portfolios: Array<{
    portfolioId: number;
    name: string;
    isSolo: boolean;
    reserveValue: number;
    previousCloseValue: number;
    currentInvestedValue: number;
    estimatedCurrentTotalValue: number;
    holdings: Array<{
      stockId: number;
      symbol: string;
      name: string;
      quantity: number;
      averageBuyPrice: number;
      currentPrice: number;
      positionValue: number;
      allocationPct: number;
    }>;
    history: Array<{
      time: string;
      value: number;
    }>;
  }>;
}

const MAX_USER_MESSAGE_CHARS = 4000;
const MAX_SELECTED_PORTFOLIOS = 6;
const MAX_INPUT_TOKENS_BUDGET = 110000;

const estimateTokenCount = (text: string) => Math.ceil(text.length / 4);

export default function Chatbot({
  disabled = false,
  isPinned = false,
  onPinnedChange,
}: ChatbotProps) {
  const {
    chatbotState: state,
    setChatbotState: setState,
    lastConversationId,
    setLastConversationId,
    resumeRequested,
    setResumeRequested,
    initialMessage,
    setInitialMessage,
  } = useChatbot();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [conversationSearchIndex, setConversationSearchIndex] = useState<
    Record<number, string>
  >({});
  const [conversationSearchSource, setConversationSearchSource] = useState<
    Record<number, string>
  >({});
  const [activeHighlightQuery, setActiveHighlightQuery] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSearchIndex, setLoadingSearchIndex] = useState(false);
  const [portfolioContextOptions, setPortfolioContextOptions] = useState<
    PortfolioContextOption[]
  >([]);
  const [selectedPortfolioContextIds, setSelectedPortfolioContextIds] =
    useState<number[]>([]);
  const [loadingPortfolioContext, setLoadingPortfolioContext] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatbotRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const floatingMessagesRef = useRef<HTMLDivElement>(null);
  const pinnedMessagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const lastAiMessageRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [savedScrollRatio, setSavedScrollRatio] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showEndedLeagues, setShowEndedLeagues] = useState(false);
  const [contextLimitNotice, setContextLimitNotice] = useState<string | null>(
    null,
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(false);
  const { user } = useAuth();
  const { notificationsState, setNotificationsState } = useNotifications();

  const escapeRegExp = useCallback((value: string) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }, []);

  const getPreviewSnippetWithOccurrence = useCallback(
    (sourceText: string, query: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return null;
      const lowerQuery = trimmedQuery.toLowerCase();

      const lowerSource = sourceText.toLowerCase();
      const idx = lowerSource.indexOf(lowerQuery);
      if (idx === -1) return null;

      const maxSnippetLength = 72;
      const matchEnd = idx + trimmedQuery.length;
      const availableContext = Math.max(
        0,
        maxSnippetLength - trimmedQuery.length,
      );
      const leftContext = Math.floor(availableContext / 2);
      const rightContext = availableContext - leftContext;

      const snippetStart = Math.max(0, idx - leftContext);
      const snippetEnd = Math.min(sourceText.length, matchEnd + rightContext);

      let snippet = sourceText
        .slice(snippetStart, snippetEnd)
        .replace(/\s+/g, " ")
        .trim();

      if (snippetStart > 0) {
        snippet = `...${snippet}`;
      }

      if (snippetEnd < sourceText.length) {
        snippet = `${snippet}...`;
      }

      return snippet;
    },
    [],
  );

  const renderHighlightedText = useCallback(
    (text: string, query: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return text;

      const pattern = new RegExp(`(${escapeRegExp(trimmedQuery)})`, "gi");
      const parts = text.split(pattern);
      const queryLower = trimmedQuery.toLowerCase();

      return parts.map((part, index) =>
        part.toLowerCase() === queryLower ? (
          <mark
            key={`${part}-${index}`}
            className="bg-yellow-200 rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        ),
      );
    },
    [escapeRegExp],
  );

  const renderHighlightedNode = useCallback(
    (node: ReactNode, query: string): ReactNode => {
      if (!query.trim()) return node;

      if (typeof node === "string") {
        return renderHighlightedText(node, query);
      }

      if (Array.isArray(node)) {
        return node.map((child, index) => (
          <Fragment key={index}>{renderHighlightedNode(child, query)}</Fragment>
        ));
      }

      return node;
    },
    [renderHighlightedText],
  );

  const getVisibleTextForCounting = useCallback((text: string) => {
    return text
      .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "")
      .replace(/!\[([^\]]*)\]\((?:\\.|[^\\)])*\)/g, "$1")
      .replace(/\[([^\]]+)\]\((?:\\.|[^\\)])*\)/g, "$1")
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  }, []);

  const activeHighlightCount = useMemo(() => {
    const query = activeHighlightQuery.trim();
    if (!query) return 0;

    const pattern = new RegExp(escapeRegExp(query), "gi");

    return messages.reduce((total, msg) => {
      const visibleText = getVisibleTextForCounting(msg.text);
      const matches = visibleText.match(pattern);
      return total + (matches?.length ?? 0);
    }, 0);
  }, [activeHighlightQuery, messages, escapeRegExp, getVisibleTextForCounting]);

  const portfolioContextById = useMemo(
    () =>
      new Map(
        portfolioContextOptions.map((portfolio) => [portfolio.id, portfolio]),
      ),
    [portfolioContextOptions],
  );

  const portfolioContextByName = useMemo(() => {
    const map = new Map<string, PortfolioContextOption>();
    for (const portfolio of portfolioContextOptions) {
      if (!map.has(portfolio.name)) {
        map.set(portfolio.name, portfolio);
      }
    }
    return map;
  }, [portfolioContextOptions]);

  const getPortfolioContextHref = useCallback(
    (portfolioId?: number, portfolioName?: string) => {
      const portfolio =
        (typeof portfolioId === "number"
          ? portfolioContextById.get(portfolioId)
          : undefined) ??
        (portfolioName ? portfolioContextByName.get(portfolioName) : undefined);

      if (!portfolio) return null;
      if (portfolio.isSolo) return "/solo";
      if (typeof portfolio.leagueId === "number") {
        return `/league/${portfolio.leagueId}/portfolio`;
      }

      return null;
    },
    [portfolioContextById, portfolioContextByName],
  );

  const groupedPortfolioContextOptions = useMemo(() => {
    const grouped = {
      personal: portfolioContextOptions.filter(
        (portfolio) => portfolio.group === "personal",
      ),
      current: portfolioContextOptions.filter(
        (portfolio) => portfolio.group === "current",
      ),
      ended: portfolioContextOptions.filter(
        (portfolio) => portfolio.group === "ended",
      ),
    };

    const sortByName = (a: PortfolioContextOption, b: PortfolioContextOption) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    grouped.personal.sort(sortByName);
    grouped.current.sort(sortByName);
    grouped.ended.sort(sortByName);

    return grouped;
  }, [portfolioContextOptions]);

  const hasSelectedEndedPortfolio = useMemo(() => {
    const endedIds = new Set(
      groupedPortfolioContextOptions.ended.map((portfolio) => portfolio.id),
    );
    return selectedPortfolioContextIds.some((id) => endedIds.has(id));
  }, [groupedPortfolioContextOptions.ended, selectedPortfolioContextIds]);

  const buildSelectedPortfolioContext = useCallback(async () => {
    if (!user || selectedPortfolioContextIds.length === 0) {
      return null;
    }

    const { data: portfolios, error: portfoliosError } = await supabase
      .from("Portfolios")
      .select(
        "portfolio_id, league_id, is_solo, reserve_value, previous_close_value",
      )
      .eq("user_id", user.id)
      .in("portfolio_id", selectedPortfolioContextIds);

    if (portfoliosError || !portfolios || portfolios.length === 0) {
      console.error(
        "Failed to load selected portfolio context details:",
        portfoliosError,
      );
      return null;
    }

    const portfolioIds = portfolios.map((portfolio) => portfolio.portfolio_id);
    const leagueIds = [
      ...new Set(
        portfolios
          .map((portfolio) => portfolio.league_id)
          .filter((leagueId): leagueId is number => leagueId !== null),
      ),
    ];

    let leagueNameById: Record<number, string> = {};
    if (leagueIds.length > 0) {
      const { data: leagues, error: leaguesError } = await supabase
        .from("Leagues")
        .select("league_id, name")
        .in("league_id", leagueIds);

      if (leaguesError) {
        console.error(
          "Failed to load league names for selected portfolio context:",
          leaguesError,
        );
      } else if (leagues) {
        leagueNameById = Object.fromEntries(
          leagues.map((league) => [league.league_id, league.name]),
        );
      }
    }

    const { data: holdingsRows, error: holdingsError } = await supabase
      .from("Portfolio Holdings")
      .select(
        "portfolio_id, stock_id, quantity, average_buy_price, portfolio_holding_id",
      )
      .in("portfolio_id", portfolioIds);

    if (holdingsError) {
      console.error(
        "Failed to load holdings for selected portfolio context:",
        holdingsError,
      );
    }

    const stockIds = [
      ...new Set((holdingsRows ?? []).map((row) => Number(row.stock_id))),
    ].filter((stockId) => Number.isFinite(stockId));

    let stockById = new Map<
      number,
      {
        stock_symbol: string | null;
        name: string | null;
        current_price: number | null;
      }
    >();
    if (stockIds.length > 0) {
      const { data: stocks, error: stocksError } = await supabase
        .from("Stocks")
        .select("stock_id, stock_symbol, name, current_price")
        .in("stock_id", stockIds);

      if (stocksError) {
        console.error(
          "Failed to load stock details for selected portfolio context:",
          stocksError,
        );
      } else if (stocks) {
        stockById = new Map(
          stocks.map((stock) => [
            Number(stock.stock_id),
            {
              stock_symbol: stock.stock_symbol,
              name: stock.name,
              current_price: stock.current_price,
            },
          ]),
        );
      }
    }

    const { data: historyRows, error: historyError } = await supabase
      .from("Portfolio Histories")
      .select("portfolio_id, timestamp_of, value")
      .in("portfolio_id", portfolioIds)
      .order("timestamp_of", { ascending: false });

    if (historyError) {
      console.error(
        "Failed to load portfolio history for selected portfolio context:",
        historyError,
      );
    }

    const holdingsByPortfolioId = (holdingsRows ?? []).reduce(
      (acc, row) => {
        const current = acc.get(row.portfolio_id) ?? [];
        current.push(row);
        acc.set(row.portfolio_id, current);
        return acc;
      },
      new Map<
        number,
        Array<{
          portfolio_id: number;
          stock_id: number;
          quantity: number | null;
          average_buy_price: number | null;
          portfolio_holding_id: number;
        }>
      >(),
    );

    const historyByPortfolioId = (historyRows ?? []).reduce(
      (acc, row) => {
        const current = acc.get(row.portfolio_id) ?? [];
        if (current.length < 12) {
          current.push(row);
        }
        acc.set(row.portfolio_id, current);
        return acc;
      },
      new Map<
        number,
        Array<{
          portfolio_id: number;
          timestamp_of: string;
          value: number | null;
        }>
      >(),
    );

    const nameByPortfolioId = new Map(
      portfolioContextOptions.map((portfolio) => [
        portfolio.id,
        portfolio.name,
      ]),
    );

    const orderedPortfolios = [...portfolios].sort(
      (a, b) =>
        selectedPortfolioContextIds.indexOf(a.portfolio_id) -
        selectedPortfolioContextIds.indexOf(b.portfolio_id),
    );

    const portfolioSnapshots: PortfolioContextSnapshot["portfolios"] =
      orderedPortfolios.map((portfolio) => {
        const rawHoldings =
          holdingsByPortfolioId.get(portfolio.portfolio_id) ?? [];

        const holdings = rawHoldings
          .map((holding) => {
            const stock = stockById.get(Number(holding.stock_id));
            const quantity = Number(holding.quantity ?? 0);
            const currentPrice = Number(stock?.current_price ?? 0);
            const averageBuyPrice = Number(holding.average_buy_price ?? 0);
            const positionValue = quantity * currentPrice;

            return {
              stockId: Number(holding.stock_id),
              symbol: stock?.stock_symbol || "UNKNOWN",
              name: stock?.name || "Unknown Stock",
              quantity,
              averageBuyPrice,
              currentPrice,
              positionValue,
            };
          })
          .sort((a, b) => b.positionValue - a.positionValue);

        const currentInvestedValue = holdings.reduce(
          (sum, holding) => sum + holding.positionValue,
          0,
        );
        const reserveValue = Number(portfolio.reserve_value ?? 0);
        const previousCloseValue = Number(portfolio.previous_close_value ?? 0);
        const estimatedCurrentTotalValue = currentInvestedValue + reserveValue;
        const denominator =
          estimatedCurrentTotalValue > 0 ? estimatedCurrentTotalValue : 1;

        const holdingsWithAllocation = holdings.map((holding) => ({
          ...holding,
          allocationPct: (holding.positionValue / denominator) * 100,
        }));

        const history = (historyByPortfolioId.get(portfolio.portfolio_id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              new Date(a.timestamp_of).getTime() -
              new Date(b.timestamp_of).getTime(),
          )
          .map((entry) => ({
            time: entry.timestamp_of,
            value: Number(entry.value ?? 0),
          }));

        const leagueName =
          (portfolio.league_id && leagueNameById[portfolio.league_id]) || null;

        return {
          portfolioId: portfolio.portfolio_id,
          name:
            nameByPortfolioId.get(portfolio.portfolio_id) ||
            (portfolio.is_solo
              ? "Solo Portfolio"
              : leagueName || "League Portfolio"),
          isSolo: Boolean(portfolio.is_solo),
          reserveValue,
          previousCloseValue,
          currentInvestedValue,
          estimatedCurrentTotalValue,
          holdings: holdingsWithAllocation,
          history,
        };
      });

    return {
      selectedAt: new Date().toISOString(),
      portfolioCount: portfolioSnapshots.length,
      portfolios: portfolioSnapshots,
    } as PortfolioContextSnapshot;
  }, [user, selectedPortfolioContextIds, portfolioContextOptions]);

  useEffect(() => {
    if (!user) {
      setPortfolioContextOptions([]);
      setSelectedPortfolioContextIds([]);
      return;
    }

    let isCancelled = false;

    const fetchPortfolioContextOptions = async () => {
      setLoadingPortfolioContext(true);

      const { data: portfolios, error: portfoliosError } = await supabase
        .from("Portfolios")
        .select("portfolio_id, is_solo, league_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (isCancelled) return;

      if (portfoliosError || !portfolios) {
        console.error(
          "Failed to load portfolios for chatbot context:",
          portfoliosError,
        );
        setPortfolioContextOptions([]);
        setSelectedPortfolioContextIds([]);
        setLoadingPortfolioContext(false);
        return;
      }

      const leagueIds = [
        ...new Set(
          portfolios
            .map((portfolio) => portfolio.league_id)
            .filter((id): id is number => id !== null),
        ),
      ];

      let leagueNameById: Record<number, string> = {};
      let leagueFinishTimeById: Record<number, string | null> = {};
      if (leagueIds.length > 0) {
        const { data: leagues, error: leaguesError } = await supabase
          .from("Leagues")
          .select("league_id, name, finish_time")
          .in("league_id", leagueIds);

        if (leaguesError) {
          console.error(
            "Failed to load league names for chatbot context:",
            leaguesError,
          );
        } else if (leagues) {
          leagueNameById = Object.fromEntries(
            leagues.map((league) => [league.league_id, league.name]),
          );
          leagueFinishTimeById = Object.fromEntries(
            leagues.map((league) => [league.league_id, league.finish_time]),
          );
        }
      }

      const nextOptions: PortfolioContextOption[] = portfolios.map(
        (portfolio) => {
          if (portfolio.is_solo) {
            return {
              id: portfolio.portfolio_id,
              name: "Solo Portfolio",
              isSolo: true,
              leagueId: null,
              group: "personal",
            };
          }

          const leagueName =
            (portfolio.league_id && leagueNameById[portfolio.league_id]) ||
            "League Portfolio";

          const leagueFinishTime =
            (portfolio.league_id &&
              leagueFinishTimeById[portfolio.league_id]) ||
            null;
          const isEnded =
            typeof leagueFinishTime === "string" &&
            new Date(leagueFinishTime) < new Date();

          return {
            id: portfolio.portfolio_id,
            name: leagueName,
            isSolo: false,
            leagueId: portfolio.league_id,
            group: isEnded ? "ended" : "current",
          };
        },
      );

      setPortfolioContextOptions(nextOptions);
      setSelectedPortfolioContextIds((prev) =>
        prev.filter((portfolioId) =>
          nextOptions.some((portfolio) => portfolio.id === portfolioId),
        ),
      );
      setLoadingPortfolioContext(false);
    };

    void fetchPortfolioContextOptions();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  const togglePortfolioContextItem = useCallback((portfolioId: number) => {
    setSelectedPortfolioContextIds((prev) => {
      if (prev.includes(portfolioId)) {
        setContextLimitNotice(null);
        return prev.filter((id) => id !== portfolioId);
      }

      if (prev.length >= MAX_SELECTED_PORTFOLIOS) {
        setContextLimitNotice(
          `Max context reached. You can share up to ${MAX_SELECTED_PORTFOLIOS} portfolios at once.`,
        );
        return prev;
      }

      setContextLimitNotice(null);
      return [...prev, portfolioId];
    });
  }, []);

  const removePortfolioContextItem = useCallback((portfolioId: number) => {
    setContextLimitNotice(null);
    setSelectedPortfolioContextIds((prev) =>
      prev.filter((id) => id !== portfolioId),
    );
  }, []);

  useEffect(() => {
    if (conversationId) {
      setLastConversationId(conversationId);
    }
  }, [conversationId, setLastConversationId]);

  useEffect(() => {
    if (!resumeRequested || !lastConversationId) return;

    let isCancelled = false;

    const loadResumeConversation = async () => {
      setLoadingHistory(true);

      const { data, error } = await getConversationMessages(lastConversationId);

      if (!isCancelled) {
        if (error) {
          console.error("Failed to load resumed conversation:", error);
        } else if (data) {
          const loadedMessages: Message[] = data.map((msg: ChatMessage) => ({
            id: msg.message_id.toString(),
            text: msg.message_text,
            sender: msg.is_ai_message ? "ai" : "user",
            timestamp: new Date(msg.created_at),
            contextPortfolioNames:
              msg.context_portfolio_names && msg.context_portfolio_names.length
                ? msg.context_portfolio_names
                : undefined,
          }));

          setMessages(loadedMessages);
          setConversationId(lastConversationId);
          setViewMode("chat");
        }

        setLoadingHistory(false);
        setResumeRequested(false);
      }
    };

    void loadResumeConversation();

    return () => {
      isCancelled = true;
    };
  }, [lastConversationId, resumeRequested, setResumeRequested]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const sidebarRect = sidebarRef.current.getBoundingClientRect();
        // Sidebar is on the right, so width increases as we move mouse left.
        // We use the right edge of the window (or rect) as the anchor.
        // newWidth = RightEdge - MouseX
        const newWidth = sidebarRect.right - mouseMoveEvent.clientX;
        setSidebarWidth(newWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useLayoutEffect(() => {
    if (isMobileViewport && isPinned) {
      onPinnedChange?.(false);
      if (state !== "closed") {
        setState("closed");
      }
    }
  }, [isMobileViewport, isPinned, onPinnedChange, setState, state]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  useEffect(() => {
    const root = document.documentElement;

    const updatePinnedWidth = () => {
      if (isPinned && !isMobileViewport && sidebarRef.current) {
        const width = sidebarRef.current.getBoundingClientRect().width;
        root.style.setProperty(
          "--ff-chatbot-pinned-width",
          `${Math.round(width)}px`,
        );
        return;
      }

      root.style.setProperty("--ff-chatbot-pinned-width", "0px");
    };

    updatePinnedWidth();

    if (!(isPinned && !isMobileViewport && sidebarRef.current)) {
      return () => {
        root.style.setProperty("--ff-chatbot-pinned-width", "0px");
      };
    }

    const observer = new ResizeObserver(() => {
      updatePinnedWidth();
    });

    observer.observe(sidebarRef.current);
    window.addEventListener("resize", updatePinnedWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePinnedWidth);
      root.style.setProperty("--ff-chatbot-pinned-width", "0px");
    };
  }, [isPinned, isMobileViewport]);

  // Handle dynamic spacer calculation
  useLayoutEffect(() => {
    const calculateSpacer = () => {
      const container =
        floatingMessagesRef.current || pinnedMessagesRef.current;
      const lastUser = lastUserMessageRef.current;
      const lastAi = lastAiMessageRef.current; // This will track the growing AI message

      // If we don't have the elements, no spacer needed
      if (!container || !lastUser) {
        setSpacerHeight(0);
        return;
      }

      // Calculate heights
      const containerHeight = container.clientHeight;
      const userHeight = lastUser.offsetHeight;
      const aiHeight = lastAi?.offsetHeight || 0;

      // Calculate the gap (space-y-4 is 1rem/16px)
      // We want to account for the gap between the user message and the AI message
      const gap = 16;

      // Calculate occupied height: User Msg + Gap + AI Msg + (potential bottom padding/gap)
      const contentHeight = userHeight + (lastAi ? gap : 0) + aiHeight;

      // The spacer should fill the rest of the screen so the User message is at top
      // spacer = container - content
      // We add a buffer to ensure there's enough scroll space to honor the scroll-margin
      const neededSpacer = Math.max(0, containerHeight - contentHeight + 40);

      setSpacerHeight(neededSpacer);
    };

    calculateSpacer();

    const resizeObserver = new ResizeObserver(() => {
      calculateSpacer();
    });

    if (floatingMessagesRef.current)
      resizeObserver.observe(floatingMessagesRef.current);
    if (pinnedMessagesRef.current)
      resizeObserver.observe(pinnedMessagesRef.current);
    if (lastAiMessageRef.current)
      resizeObserver.observe(lastAiMessageRef.current);

    return () => resizeObserver.disconnect();
  }, [messages, state, isPinned, viewMode]);

  // Scroll to user message when streaming starts
  useEffect(() => {
    if (isStreaming && lastUserMessageRef.current) {
      lastUserMessageRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [isStreaming]);

  // Auto-scroll to bottom when messages change (but not during or after streaming)
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    // Only auto-scroll if we're not streaming and we didn't just finish streaming
    // And only if we are not in the "hold at top" mode which implies...
    // Actually, if we just sent a message, isStreaming handles it.
    // If we load history, maybe we want to scroll to bottom?
    if (!isStreaming && !wasStreaming && messages.length > 0) {
      // If it's a new message just added by user (but before streaming starts), handled by scrollIntoView in handleSend?
      // Let's rely on standard behavior for history load
      if (viewMode === "history") {
        // Do nothing or scroll top? History usually scroll top
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, isStreaming, viewMode]);

  // Handle click outside to close
  useEffect(() => {
    if (state === "closed" || isPinned) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const isDropdownInteraction = Boolean(
        target?.closest('[data-slot="dropdown-menu-content"]') ||
        target?.closest('[data-slot="dropdown-menu-trigger"]'),
      );

      if (isDropdownInteraction) {
        return;
      }

      if (
        chatbotRef.current &&
        !chatbotRef.current.contains(event.target as Node)
      ) {
        setState("closed");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state, isPinned]);

  // Auto-focus input when floating window opens
  useEffect(() => {
    if (state === "floating" && viewMode === "chat") {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [state, viewMode]);

  // Auto-send initial message when set from stock details modal
  useEffect(() => {
    if (initialMessage && state === "floating" && !isStreaming) {
      // Use a small delay to ensure the message state is updated
      const timer = setTimeout(() => {
        handleSendWithMessage(initialMessage);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [initialMessage, state]);

  const handleToggle = () => {
    if (state === "closed") {
      // Opening floating window - start fresh
      setMessages([]);
      setConversationId(null);
      setViewMode("chat");
      setState("floating");
    } else {
      // Closing window
      setState("closed");
    }
  };

  const handleSendWithMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || !user) return;

      const trimmedMessage = messageText.trim();
      if (trimmedMessage.length > MAX_USER_MESSAGE_CHARS) {
        const inputLimitMessage: Message = {
          id: Date.now().toString(),
          text: `Please keep messages under ${MAX_USER_MESSAGE_CHARS.toLocaleString()} characters so I can respond reliably.`,
          sender: "ai",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, inputLimitMessage]);
        return;
      }
      const selectedContextPortfoliosForMessage = selectedPortfolioContextIds
        .map((portfolioId) => portfolioContextById.get(portfolioId))
        .filter((portfolio): portfolio is PortfolioContextOption =>
          Boolean(portfolio),
        );

      const selectedContextNamesForMessage =
        selectedContextPortfoliosForMessage.map((portfolio) => portfolio.name);
      const selectedContextIdsForMessage =
        selectedContextPortfoliosForMessage.map((portfolio) => portfolio.id);

      // Add user message to UI immediately
      const userMessage: Message = {
        id: Date.now().toString(),
        text: trimmedMessage,
        sender: "user",
        timestamp: new Date(),
        contextPortfolioNames: selectedContextNamesForMessage,
        contextPortfolioIds: selectedContextIdsForMessage,
      };

      setMessages((prev) => [...prev, userMessage]);
      setState("floating");

      // Clear the initial message after sending it
      if (initialMessage) {
        setInitialMessage(null);
      }

      try {
        // Create conversation if this is the first message
        let currentConversationId = conversationId;
        if (!currentConversationId) {
          const { data: conversation, error: convError } =
            await createConversation(
              user.id,
              trimmedMessage.substring(0, 50), // Use first 50 chars as title
            );

          if (convError || !conversation) {
            console.error("Failed to create conversation:", convError);
            return;
          }

          currentConversationId = conversation.conversation_id;
          setConversationId(currentConversationId);
        }

        // Save user message to database
        const { error: userMsgError } = await addMessage(
          currentConversationId,
          trimmedMessage,
          false,
          selectedContextNamesForMessage,
        );

        if (userMsgError) {
          console.error("Failed to save user message:", userMsgError);
        }

        // Create placeholder AI message for streaming
        const aiMessageId = (Date.now() + 1).toString();
        const aiMessage: Message = {
          id: aiMessageId,
          text: "",
          sender: "ai",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);

        // Define your system prompt / instructions here
        const selectedPortfolioContext = await buildSelectedPortfolioContext();
        const selectedPortfolioSummary = selectedPortfolioContext
          ? selectedPortfolioContext.portfolios.map((portfolio) => ({
              portfolioId: portfolio.portfolioId,
              name: portfolio.name,
              holdingsCount: portfolio.holdings.length,
              historyPoints: portfolio.history.length,
            }))
          : [];

        const selectedPortfolioAnalysisUnits = selectedPortfolioContext
          ? selectedPortfolioContext.portfolios.map((portfolio) => {
              const topHolding = [...portfolio.holdings].sort(
                (a, b) => b.positionValue - a.positionValue,
              )[0];
              const top3AllocationPct = [...portfolio.holdings]
                .sort((a, b) => b.allocationPct - a.allocationPct)
                .slice(0, 3)
                .reduce((sum, holding) => sum + holding.allocationPct, 0);
              const cashPct =
                portfolio.estimatedCurrentTotalValue > 0
                  ? (portfolio.reserveValue /
                      portfolio.estimatedCurrentTotalValue) *
                    100
                  : 0;
              const dayChangeDollar =
                portfolio.estimatedCurrentTotalValue -
                portfolio.previousCloseValue;
              const dayChangePct =
                portfolio.previousCloseValue > 0
                  ? (dayChangeDollar / portfolio.previousCloseValue) * 100
                  : 0;

              return {
                portfolioId: portfolio.portfolioId,
                portfolioName: portfolio.name,
                isSolo: portfolio.isSolo,
                totalValue: portfolio.estimatedCurrentTotalValue,
                reserveValue: portfolio.reserveValue,
                investedValue: portfolio.currentInvestedValue,
                cashPct,
                holdingsCount: portfolio.holdings.length,
                topHoldingSymbol: topHolding?.symbol ?? null,
                topHoldingAllocationPct: topHolding?.allocationPct ?? 0,
                top3AllocationPct,
                dayChangeDollar,
                dayChangePct,
                historyPoints: portfolio.history.length,
              };
            })
          : [];

        const portfolioContextPayload = selectedPortfolioContext
          ? {
              format: "fantasy-finance-portfolio-context-v2",
              generatedAt: new Date().toISOString(),
              selectedPortfolioIds: selectedPortfolioContext.portfolios.map(
                (portfolio) => portfolio.portfolioId,
              ),
              selectedPortfolioNames: selectedPortfolioContext.portfolios.map(
                (portfolio) => portfolio.name,
              ),
              analysisUnits: selectedPortfolioAnalysisUnits,
              portfolios: selectedPortfolioContext.portfolios,
            }
          : null;

        const systemPrompt = {
          role: "system",
          content: `
            You are the Fantasy Finance portfolio assistant.
            You help users manage portfolios in a stock trading game.

            Core game model:
            - A portfolio = reserve cash + stock holdings.
            - Each holding includes symbol, quantity, current price, and dollar position value.
            - Portfolio context may include history points over time.
            - Users will often ask things like: "analyze my portfolios", "what should I buy", "what should I sell", "which portfolio is riskiest".

            Hard rules:
            - Treat this as a game assistant. Give actionable recommendations.
            - Do not give generic textbook-only answers when portfolio context is provided.
            - If portfolio context is provided, use that exact data in your analysis.
            - Only use portfolios contained in PORTFOLIO_CONTEXT_ENVELOPE. Those are the only portfolios currently shared.
            - If no detailed portfolio context is shared, say you cannot see portfolio details yet and ask the user to share portfolios with the Add Context button.
            - If user asks about a specific portfolio that is not currently shared, explicitly say it is not currently visible and ask them to share that one.
            - Never claim to see data that is not in the provided context.
            - Treat each item in analysisUnits as one portfolio-level analysis object. Start portfolio comparisons from analysisUnits first, then use holdings/history for supporting detail.

            How to respond to common intents:
            - "Analyze my portfolios":
              - If shared context exists: compare the shared portfolios directly (cash level, top positions, concentration, diversification, recent trend from history), then give concrete next actions.
              - If no shared context: say you need the user to share one or more portfolios via Add Context for analysis.
            - "List my portfolios":
              - List only currently shared portfolio names from PORTFOLIO_CONTEXT_ENVELOPE.
              - If none are shared, say none are visible yet.
            - Buy/sell questions:
              - Give a direct action first, then a short rationale tied to the user’s portfolio exposures and cash.

            Output quality:
            - Be concise, practical, and specific.
            - Prefer bullets and short sections.
            - Include confidence (high/medium/low) for recommendation-style answers.
            - Mention key risk flags (concentration, low cash, overexposure to one stock/theme).
            - Avoid long stock/company overviews unless asked.
            - Do not include legal/financial disclaimers.

            Style:
            - Be concise, structured, and practical.
            - Use simple language, teach briefly as you go (1–2 short lessons max).
            - Avoid disclaimers (the UI already provides a game disclaimer).
            - Avoid long company/stock overviews; prioritize actionable interpretation.

            Formatting rules (adaptive):
            - Do NOT force one fixed template for every question.
            - DO NOT include disclaimers about not being a financial advisor; the UI already has a game disclaimer.
            - Match the format to the request type:
              - If user asks for picks/ideas/lists, return a numbered list with exactly the requested count.
              - If user asks for a direct action, lead with the action first, then brief reasoning.
              - If user asks an educational question, prioritize explanation over recommendation headers.
            - Use the detailed sectioned format below only when it improves clarity for recommendation-style answers:
              - Recommendation
              - Rationale
              - Confidence
              - Key risks & what to watch
              - Sources

            Today’s date: ${new Date().toLocaleDateString()}

            Shared portfolio summary:
            ${
              selectedPortfolioSummary.length > 0
                ? JSON.stringify(selectedPortfolioSummary, null, 2)
                : "No portfolios currently shared"
            }

            PORTFOLIO_CONTEXT_ENVELOPE_START
            ${
              portfolioContextPayload
                ? JSON.stringify(portfolioContextPayload, null, 2)
                : "null"
            }
            PORTFOLIO_CONTEXT_ENVELOPE_END
            `.trim(),
        };

        const systemPromptTokens = estimateTokenCount(systemPrompt.content);
        const userMessageTokens = estimateTokenCount(trimmedMessage);
        const maxHistoryTokens = Math.max(
          0,
          MAX_INPUT_TOKENS_BUDGET - systemPromptTokens - userMessageTokens,
        );

        const boundedHistoryMessages: Array<{
          role: "assistant" | "user";
          content: string;
        }> = [];
        let usedHistoryTokens = 0;

        for (let index = messages.length - 1; index >= 0; index--) {
          const msg = messages[index];
          const content = msg.text.trim();
          if (!content) continue;

          const msgTokens = estimateTokenCount(content);
          if (usedHistoryTokens + msgTokens > maxHistoryTokens) {
            break;
          }

          boundedHistoryMessages.push({
            role: msg.sender === "ai" ? "assistant" : "user",
            content,
          });
          usedHistoryTokens += msgTokens;
        }

        boundedHistoryMessages.reverse();

        // Add the new user message AND the system prompt at the start
        const apiMessages = [
          systemPrompt,
          ...boundedHistoryMessages,
          { role: "user", content: trimmedMessage },
        ];

        // Call OpenAI with streaming
        setLoadingAI(true);
        setIsStreaming(true);
        let fullResponse = "";
        let hasReceivedChunk = false;

        const { error: streamError } = await callOpenAIStream(
          apiMessages,
          (chunk) => {
            fullResponse += chunk;
            // Stop loading indicator and scroll to response on first chunk
            if (!hasReceivedChunk) {
              hasReceivedChunk = true;
              setLoadingAI(false);
              // Scroll to show the user message and start of AI response
              setTimeout(() => {
                lastUserMessageRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }, 0);
            }
            // Update the AI message with the accumulated response
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId ? { ...msg, text: fullResponse } : msg,
              ),
            );
          },
        );

        setLoadingAI(false);
        setIsStreaming(false);

        if (streamError) {
          console.error("Failed to get AI response:", streamError);
          // Show error message to user
          const errorMessage: Message = {
            id: (Date.now() + 2).toString(),
            text: "Sorry, I encountered an error. Please try again.",
            sender: "ai",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
          return;
        }

        // Save AI message to database
        const { error: aiMsgError } = await addMessage(
          currentConversationId,
          fullResponse,
          true,
        );

        if (aiMsgError) {
          console.error("Failed to save AI message:", aiMsgError);
        }
      } catch (error) {
        console.error("Error handling message:", error);
        setLoadingAI(false);
      }
    },
    [
      user,
      conversationId,
      messages,
      initialMessage,
      setInitialMessage,
      buildSelectedPortfolioContext,
      selectedPortfolioContextIds,
      portfolioContextById,
    ],
  );

  const handleSend = async () => {
    if (!message.trim() || !user) return;

    const messageText = message.trim();
    setMessage("");
    await handleSendWithMessage(messageText);
  };

  const handlePin = () => {
    if (isMobileViewport) {
      return;
    }

    // Close notifications panel if open
    if (notificationsState !== "closed") {
      setNotificationsState("closed");
    }

    // Capture current scroll position in floating expanded window as a ratio
    const el = floatingMessagesRef.current;
    if (el) {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
      setSavedScrollRatio(ratio);
    } else {
      setSavedScrollRatio(null);
    }

    onPinnedChange?.(true);
  };

  const handleClose = () => {
    if (isPinned) {
      onPinnedChange?.(false);
    }
    setState("closed");
    setViewMode("chat");
    setActiveHighlightQuery("");
  };

  const handleShowHistory = async () => {
    if (!user) return;

    setViewMode("history");
    setState("floating");
    setHistorySearchQuery("");
    setLoadingHistory(true);

    const { data, error } = await getUserConversations(user.id);

    if (error) {
      console.error("Failed to load conversations:", error);
    } else if (data) {
      setConversations(data);

      const initialIndex: Record<number, string> = {};
      const initialSource: Record<number, string> = {};
      for (const conversation of data) {
        initialIndex[conversation.conversation_id] =
          conversation.title.toLowerCase();
        initialSource[conversation.conversation_id] = conversation.title;
      }
      setConversationSearchIndex(initialIndex);
      setConversationSearchSource(initialSource);

      setLoadingSearchIndex(true);
      const indexEntries = await Promise.all(
        data.map(async (conversation) => {
          const { data: conversationMessages } = await getConversationMessages(
            conversation.conversation_id,
          );

          const messageText = (conversationMessages ?? [])
            .map((msg) => msg.message_text)
            .join(" ");

          const combinedText = `${conversation.title} ${messageText}`.trim();

          return [
            conversation.conversation_id,
            {
              searchableText: combinedText.toLowerCase(),
              sourceText: combinedText,
            },
          ] as const;
        }),
      );

      const nextIndex: Record<number, string> = {};
      const nextSource: Record<number, string> = {};
      for (const [id, texts] of indexEntries) {
        nextIndex[id] = texts.searchableText;
        nextSource[id] = texts.sourceText;
      }
      setConversationSearchIndex(nextIndex);
      setConversationSearchSource(nextSource);
      setLoadingSearchIndex(false);
    }

    setLoadingHistory(false);
  };

  const handleLoadConversation = async (
    conversation: ChatConversation,
    highlightQuery = "",
  ) => {
    setLoadingHistory(true);

    const { data, error } = await getConversationMessages(
      conversation.conversation_id,
    );

    if (error) {
      console.error("Failed to load messages:", error);
    } else if (data) {
      // Convert ChatMessage[] to Message[]
      const loadedMessages: Message[] = data.map((msg: ChatMessage) => ({
        id: msg.message_id.toString(),
        text: msg.message_text,
        sender: msg.is_ai_message ? "ai" : "user",
        timestamp: new Date(msg.created_at),
        contextPortfolioNames:
          msg.context_portfolio_names && msg.context_portfolio_names.length
            ? msg.context_portfolio_names
            : undefined,
      }));

      setMessages(loadedMessages);
      setConversationId(conversation.conversation_id);
    }

    setActiveHighlightQuery(highlightQuery.trim());
    setLoadingHistory(false);
    setViewMode("chat");
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setViewMode("chat");
    setActiveHighlightQuery("");

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  // When switching to pinned mode, restore the saved scroll position
  useEffect(() => {
    if (isPinned && savedScrollRatio !== null && viewMode === "chat") {
      const el = pinnedMessagesRef.current;
      if (el) {
        const applyScroll = () => {
          const maxScroll = el.scrollHeight - el.clientHeight;
          const target = Math.round(savedScrollRatio * Math.max(0, maxScroll));
          el.scrollTop = target;
          // Clear saved ratio to avoid re-applying
          setSavedScrollRatio(null);
        };
        // Apply after layout to ensure measurements are correct
        requestAnimationFrame(applyScroll);
      }
    }
  }, [isPinned, savedScrollRatio, viewMode]);

  if (disabled) return null;

  if (isMobileViewport && isPinned) return null;

  // Render header (shared between pinned and floating modes)
  const renderHeader = (showPinButton = false) => (
    <div className="flex items-center justify-between h-14 px-4 border-b border-gray-300">
      <div className="flex items-center gap-1 ">
        <Button
          disabled={viewMode === "chat"}
          variant="ghost"
          size="sm"
          onClick={() => setViewMode("chat")}
          className="h-8 w-8 p-0 opacity-100!"
        >
          {viewMode === "history" ? (
            <ArrowLeft className="h-4 w-4 " />
          ) : (
            <Stars className="h-4 w-4 text-green-700" />
          )}
        </Button>

        <h2
          className={`text-md font-medium ${viewMode === "chat" && "text-green-700"}`}
        >
          {viewMode === "history" ? "Chat History" : "Assistant"}
        </h2>
      </div>
      <div className="flex gap-1">
        {viewMode === "chat" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShowHistory}
              // className={`h-8 ${state === "floating" ? "px-2" : "w-8 p-0"}`}
              className={isMobileViewport ? "h-8 w-8 p-0" : "h-8 px-2"}
            >
              {isMobileViewport ? (
                <History className="size-5" />
              ) : (
                <span className="text-xs flex items-center">
                  <History className="inline-block h-4 w-4 mr-1" />
                  History
                </span>
              )}
              {/* {state === "floating" && <span className="text-xs">History</span>} */}
            </Button>
            {conversationId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewChat}
                className="h-8 px-2 text-green-700"
              >
                <span className="text-xs flex items-center">
                  <Plus className="inline-block h-4 w-4 mr-1" />
                  New
                </span>
              </Button>
            )}
            {showPinButton && !isMobileViewport && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePin}
                className="h-8 w-8 p-0"
              >
                <Pin className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
        {viewMode === "history" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              className="h-8 px-2 text-green-700"
            >
              <span className="text-xs flex items-center">
                <Plus className="inline-block h-4 w-4 mr-1" />
                New
              </span>
            </Button>
            {showPinButton && !isMobileViewport && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePin}
                className="h-8 w-8 p-0"
              >
                <Pin className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
        {(isPinned || isMobileViewport) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
          >
            <X className={isMobileViewport ? "size-5" : "h-4 w-4"} />
          </Button>
        )}
      </div>
    </div>
  );

  // Render input area (shared between pinned and floating modes)
  const renderInput = (className = "") => {
    const isAwaitingAIResponse = loadingAI || isStreaming;

    return (
      <div className={className}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) {
                setShowEndedLeagues(hasSelectedEndedPortfolio);
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Paperclip className="h-4 w-4" />
                Add Context ({selectedPortfolioContextIds.length}/
                {MAX_SELECTED_PORTFOLIOS})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 z-100">
              {selectedPortfolioContextIds.length > 0 && (
                <>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={(event) => {
                      event.preventDefault();
                      setSelectedPortfolioContextIds([]);
                      setContextLimitNotice(null);
                    }}
                  >
                    <span className="inline-flex size-4 items-center justify-center rounded border border-primary bg-primary text-primary-foreground">
                      <Minus
                        className="size-3 text-white"
                        strokeWidth={"2.5px"}
                      />
                    </span>
                    <span>Deselect All</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {groupedPortfolioContextOptions.personal.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-green-700">
                    Personal
                  </div>
                  {groupedPortfolioContextOptions.personal.map((portfolio) => (
                    <DropdownMenuItem
                      key={portfolio.id}
                      disabled={
                        !selectedPortfolioContextIds.includes(portfolio.id) &&
                        selectedPortfolioContextIds.length >=
                          MAX_SELECTED_PORTFOLIOS
                      }
                      className="cursor-pointer data-disabled:opacity-50"
                      onSelect={(event) => {
                        event.preventDefault();
                        togglePortfolioContextItem(portfolio.id);
                      }}
                    >
                      <Checkbox
                        checked={selectedPortfolioContextIds.includes(
                          portfolio.id,
                        )}
                        className="pointer-events-none"
                      />
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={portfolio.name}
                      >
                        {portfolio.name}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {groupedPortfolioContextOptions.current.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-green-700">
                    Ongoing Leagues
                  </div>
                  {groupedPortfolioContextOptions.current.map((portfolio) => (
                    <DropdownMenuItem
                      key={portfolio.id}
                      disabled={
                        !selectedPortfolioContextIds.includes(portfolio.id) &&
                        selectedPortfolioContextIds.length >=
                          MAX_SELECTED_PORTFOLIOS
                      }
                      className="cursor-pointer data-disabled:opacity-50"
                      onSelect={(event) => {
                        event.preventDefault();
                        togglePortfolioContextItem(portfolio.id);
                      }}
                    >
                      <Checkbox
                        checked={selectedPortfolioContextIds.includes(
                          portfolio.id,
                        )}
                        className="pointer-events-none"
                      />
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={portfolio.name}
                      >
                        {portfolio.name}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {groupedPortfolioContextOptions.ended.length > 0 && (
                <>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={(event) => {
                      event.preventDefault();
                      setShowEndedLeagues((prev) => !prev);
                    }}
                  >
                    {showEndedLeagues ? (
                      <ChevronDown className="h-3.5 w-3.5 text-green-700" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-green-700" />
                    )}
                    <span className="text-[11px] font-medium uppercase tracking-wide text-green-700">
                      Ended Leagues (
                      {groupedPortfolioContextOptions.ended.length})
                    </span>
                  </DropdownMenuItem>

                  {showEndedLeagues &&
                    groupedPortfolioContextOptions.ended.map((portfolio) => (
                      <DropdownMenuItem
                        key={portfolio.id}
                        disabled={
                          !selectedPortfolioContextIds.includes(portfolio.id) &&
                          selectedPortfolioContextIds.length >=
                            MAX_SELECTED_PORTFOLIOS
                        }
                        className="cursor-pointer data-disabled:opacity-50"
                        onSelect={(event) => {
                          event.preventDefault();
                          togglePortfolioContextItem(portfolio.id);
                        }}
                      >
                        <Checkbox
                          checked={selectedPortfolioContextIds.includes(
                            portfolio.id,
                          )}
                          className="pointer-events-none"
                        />
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={portfolio.name}
                        >
                          {portfolio.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                </>
              )}

              {portfolioContextOptions.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-gray-500">
                  {loadingPortfolioContext
                    ? "Loading portfolios..."
                    : "No portfolios found."}
                </div>
              )}
              <DropdownMenuSeparator className="mt-3" />
              {portfolioContextOptions.length > MAX_SELECTED_PORTFOLIOS && (
                <div className="px-2 py-1.5 text-xs text-gray-500">
                  Max {MAX_SELECTED_PORTFOLIOS} portfolios can be shared at
                  once.
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedPortfolioContextIds.map((portfolioId) => {
            const portfolio = portfolioContextOptions.find(
              (option) => option.id === portfolioId,
            );

            if (!portfolio) return null;

            const portfolioHref = getPortfolioContextHref(
              portfolio.id,
              portfolio.name,
            );

            return (
              <div
                key={portfolio.id}
                className="h-7 inline-flex items-center gap-1 rounded-sm bg-gray-100 pl-2 pr-1 text-xs text-gray-700"
              >
                {portfolioHref ? (
                  <Link
                    to={portfolioHref}
                    className="max-w-28 truncate hover:text-green-700"
                    title={portfolio.name}
                  >
                    {portfolio.name}
                  </Link>
                ) : (
                  <span className="max-w-28 truncate" title={portfolio.name}>
                    {portfolio.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePortfolioContextItem(portfolio.id)}
                  className="inline-flex h-5 w-5 items-center justify-center cursor-pointer text-gray-500 hover:text-gray-700"
                  aria-label={`Remove ${portfolio.name} context`}
                  title={`Remove ${portfolio.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          {(contextLimitNotice ||
            selectedPortfolioContextIds.length >= MAX_SELECTED_PORTFOLIOS) && (
            <p className="w-full text-xs text-amber-700">
              {contextLimitNotice ??
                `Max context reached (${MAX_SELECTED_PORTFOLIOS} portfolios).`}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center h-9">
          <Input
            ref={inputRef}
            type="text"
            placeholder={`Type your message...`}
            maxLength={MAX_USER_MESSAGE_CHARS}
            value={message}
            disabled={isAwaitingAIResponse}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 h-9"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isAwaitingAIResponse}
            className="w-9 h-9"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-1 text-right text-[11px] text-gray-500">
          {message.length.toLocaleString()}/
          {MAX_USER_MESSAGE_CHARS.toLocaleString()}
        </div>
      </div>
    );
  };

  // Render history list
  const renderHistory = () => {
    const normalizedQuery = historySearchQuery.trim().toLowerCase();
    const filteredConversations = normalizedQuery
      ? conversations.filter((conv) => {
          const searchableText =
            conversationSearchIndex[conv.conversation_id] ??
            conv.title.toLowerCase();
          return searchableText.includes(normalizedQuery);
        })
      : conversations;

    return (
      <div className="space-y-3 pr-2">
        <div className="space-y-1">
          <div className="relative">
            <Input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="h-9 pr-8 pl-8"
            />
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            {historySearchQuery && (
              <button
                type="button"
                onClick={() => setHistorySearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {loadingSearchIndex && !loadingHistory && (
            <p className="text-xs text-gray-500">
              Indexing messages for search...
            </p>
          )}
        </div>

        {loadingHistory ? (
          <div className="space-y-2" aria-label="Loading conversations">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="w-full rounded-sm bg-gray-100 px-3 py-2 animate-pulse"
              >
                <p className="text-sm font-medium text-gray-900 truncate">
                  &nbsp;
                </p>
                <p className="text-xs text-gray-700 mt-1 truncate whitespace-nowrap">
                  &nbsp;
                </p>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-gray-500 text-sm">No conversation history yet.</p>
        ) : filteredConversations.length === 0 ? (
          <p className="text-gray-500 text-sm">No chats match your search.</p>
        ) : (
          <div className="space-y-2">
            {filteredConversations.map((conv) =>
              (() => {
                const previewText = normalizedQuery
                  ? getPreviewSnippetWithOccurrence(
                      conversationSearchSource[conv.conversation_id] ??
                        conv.title,
                      normalizedQuery,
                    )
                  : null;

                return (
                  <button
                    key={conv.conversation_id}
                    onClick={() =>
                      handleLoadConversation(conv, normalizedQuery)
                    }
                    className="w-full text-left rounded-sm bg-gray-100 hover:bg-gray-200 px-3 py-2 shadow-none transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {conv.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(conv.created_at).toLocaleDateString()} at{" "}
                      {new Date(conv.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {previewText && (
                      <p
                        className="text-xs text-gray-700 mt-1 truncate whitespace-nowrap"
                        title={previewText}
                      >
                        {renderHighlightedText(previewText, normalizedQuery)}
                      </p>
                    )}
                  </button>
                );
              })(),
            )}
          </div>
        )}
      </div>
    );
  };

  const renderUnhighlightButton = () => {
    if (!activeHighlightQuery) return null;

    return (
      <div className="px-4 h-12 border-b border-gray-300 bg-gray-100 flex justify-between items-center gap-4">
        <div className="flex items-end gap-2 min-w-0 flex-1">
          <p
            className="font-medium text-gray-700 min-w-0 flex items-end"
            title={activeHighlightQuery}
          >
            <span className="shrink-0">"</span>
            <span className="truncate whitespace-nowrap min-w-0">
              {activeHighlightQuery}
            </span>
            <span className="shrink-0">"</span>
          </p>
          <p className="text-xs text-gray-500 whitespace-nowrap shrink-0 -translate-y-0.5">
            {activeHighlightCount}{" "}
            {activeHighlightCount === 1 ? "result" : "results"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveHighlightQuery("")}
        >
          Unhighlight
        </Button>
      </div>
    );
  };

  // Render messages
  const renderMessages = () => {
    const disclaimer = (
      <p className="text-xs text-gray-500 text-center italic">
        Not financial advice. Fantasy Finance is a game simulation and is not
        responsible for trading outcomes.
      </p>
    );

    if (messages.length === 0) {
      const starterQuestions = [
        "How should I diversify my portfolio right now?",
        "What are 3 stocks I should research this week?",
        "How do I balance risk vs reward in this game?",
      ];

      return (
        <div className="h-full flex flex-col">
          {disclaimer}
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-lg text-center">Let's learn something new!</p>
            <div className="flex flex-wrap justify-center gap-2">
              {starterQuestions.map((question) => (
                <AIQuestionChip
                  key={question}
                  label={question}
                  onClick={() => {
                    void handleSendWithMessage(question);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Identify last user and AI messages for refs
    let lastUserIdx = -1;
    let lastAiIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "user" && lastUserIdx === -1) lastUserIdx = i;
      if (messages[i].sender === "ai" && lastAiIdx === -1) lastAiIdx = i;
      if (lastUserIdx !== -1 && lastAiIdx !== -1) break;
    }

    return (
      <div className="space-y-4">
        {disclaimer}
        {messages.map((msg, index) => {
          const isLastUser = index === lastUserIdx;
          const isLastAi = index === lastAiIdx;

          return (
            <div
              key={msg.id}
              ref={
                isLastUser
                  ? lastUserMessageRef
                  : isLastAi
                    ? lastAiMessageRef
                    : null
              }
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} scroll-mt-4`}
            >
              {msg.sender === "user" ? (
                <div className="max-w-[80%] flex flex-col items-end gap-1.5">
                  <div className="bg-chat-user-bubble text-black rounded-2xl px-4 py-2 w-fit max-w-full">
                    <p className="text-sm">
                      {renderHighlightedText(msg.text, activeHighlightQuery)}
                    </p>
                  </div>
                  {msg.contextPortfolioNames &&
                    msg.contextPortfolioNames.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {msg.contextPortfolioNames.map(
                          (portfolioName, index) => {
                            const portfolioId =
                              msg.contextPortfolioIds?.[index];
                            const portfolioHref = getPortfolioContextHref(
                              portfolioId,
                              portfolioName,
                            );

                            const sharedClasses =
                              "inline-flex items-center rounded border border-gray-300 bg-white px-2 py-1 text-[11px] leading-none text-gray-700";

                            if (!portfolioHref) {
                              return (
                                <span
                                  key={`${msg.id}-${portfolioName}-${index}`}
                                  className={sharedClasses}
                                >
                                  {portfolioName}
                                </span>
                              );
                            }

                            return (
                              <Link
                                key={`${msg.id}-${portfolioName}-${index}`}
                                to={portfolioHref}
                                className={`${sharedClasses} hover:bg-gray-50 hover:text-green-700`}
                              >
                                {portfolioName}
                              </Link>
                            );
                          },
                        )}
                      </div>
                    )}
                </div>
              ) : (
                <div className="text-sm text-gray-800">
                  <ReactMarkdown
                    components={{
                      p: ({ children, ...props }) => (
                        <p className="mb-2" {...props}>
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </p>
                      ),
                      ul: (props) => (
                        <ul
                          className="list-disc list-outside mb-2 pl-5"
                          {...props}
                        />
                      ),
                      ol: (props) => (
                        <ol
                          className="list-decimal list-outside mb-2 pl-5"
                          {...props}
                        />
                      ),
                      li: ({ children, ...props }) => (
                        <li className="mb-1 [&>p]:inline [&>p]:mb-0" {...props}>
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </li>
                      ),
                      code: ({ children, ...props }) => (
                        <code
                          className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono"
                          {...props}
                        >
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </code>
                      ),
                      pre: ({ children, ...props }) => (
                        <pre
                          className="bg-gray-100 p-2 rounded overflow-x-auto mb-2"
                          {...props}
                        >
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </pre>
                      ),
                      blockquote: ({ children, ...props }) => (
                        <blockquote
                          className="border-l-4 border-gray-300 pl-3 italic mb-2"
                          {...props}
                        >
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </blockquote>
                      ),
                      strong: ({ children, ...props }) => (
                        <strong className="font-semibold" {...props}>
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </strong>
                      ),
                      em: ({ children, ...props }) => (
                        <em className="italic" {...props}>
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </em>
                      ),
                      h1: ({ children, ...props }) => (
                        <h1 className="text-lg font-bold mb-2" {...props}>
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </h1>
                      ),
                      h2: ({ children, ...props }) => (
                        <h2 className="text-base font-bold mb-2" {...props}>
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </h2>
                      ),
                      h3: ({ children, ...props }) => (
                        <h3 className="text-sm font-bold mb-2" {...props}>
                          {renderHighlightedNode(
                            children,
                            activeHighlightQuery,
                          )}
                        </h3>
                      ),
                      a: ({ href, children, ...props }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 underline underline-offset-2 hover:text-blue-700"
                          {...props}
                        >
                          <span>
                            {renderHighlightedNode(
                              children,
                              activeHighlightQuery,
                            )}
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      ),
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
        {loadingAI && (
          <div className="flex justify-start">
            <div className="text-sm text-gray-500">
              <span className="animate-pulse">AI is thinking...</span>
            </div>
          </div>
        )}
        <div
          style={{
            height: spacerHeight,
            minHeight: 0,
            transition: "height 0.1s ease-out",
          }}
        />
        <div ref={messagesEndRef} />
      </div>
    );
  };

  // Pinned mode - full height sidebar on the right
  if (isPinned && !isMobileViewport) {
    return (
      <div
        ref={sidebarRef}
        className={`relative h-full bg-white border-l border-gray-300 flex flex-col z-60 ${
          sidebarWidth ? "" : "w-64 lg:w-[400px] xl:w-[400px]"
        } min-w-64 lg:min-w-80 xl:min-w-[400px] max-w-[90vw] md:max-w-[400px] xl:max-w-[600px]`}
        style={sidebarWidth ? { width: sidebarWidth } : undefined}
      >
        {/* Resize Handle */}
        <div
          className="absolute -left-px top-0 bottom-0 w-4 cursor-col-resize z-50 -translate-x-1/2 flex justify-center group"
          onMouseDown={startResizing}
        >
          {/* Visual indicator on hover */}
          <div className="w-px h-full bg-transparent group-hover:bg-gray-400 transition-colors" />
        </div>
        {renderHeader()}
        {viewMode === "chat" && renderUnhighlightButton()}

        {/* Messages area */}
        <div
          className="flex-1 overflow-auto p-4 pr-2 chatbot-scroll"
          ref={pinnedMessagesRef}
        >
          {viewMode === "history" ? renderHistory() : renderMessages()}
        </div>

        {/* Input area - only show in chat mode */}
        {viewMode === "chat" && renderInput("p-4 border-t border-gray-300")}
      </div>
    );
  }

  return (
    <>
      {isMobileViewport ? (
        <div>
          <button
            type="button"
            aria-label="Close chatbot"
            onClick={handleClose}
            className={`fixed inset-0 bg-black/30 z-80 transition-opacity duration-300 ${
              state === "closed"
                ? "opacity-0 pointer-events-none"
                : "opacity-100 pointer-events-auto"
            }`}
          />

          <div
            className={`fixed inset-y-0 right-0 z-90 w-[88vw] max-w-sm bg-white border-l border-gray-300 flex flex-col transform transition-transform duration-300 ${
              state === "closed" ? "translate-x-full" : "translate-x-0"
            }`}
          >
            {renderHeader(true)}
            {viewMode === "chat" && renderUnhighlightButton()}

            <div
              className="flex-1 overflow-auto p-4 pr-2 chatbot-scroll"
              ref={floatingMessagesRef}
            >
              {viewMode === "history" ? renderHistory() : renderMessages()}
            </div>

            {viewMode === "chat" &&
              renderInput("border-t p-4 border-gray-300 bg-white")}
          </div>

          <button
            type="button"
            aria-label="Open AI assistant"
            onClick={handleToggle}
            className={`fixed bottom-6 right-6 z-90 py-2 px-4 cursor-pointer rounded-full shadow-lg flex items-center justify-center transition-all duration-200 bg-green-700 hover:bg-green-800 ${
              state === "closed"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
          >
            <div className="flex items-center gap-2 text-white">
              <Stars className="h-5 w-5" />
              New Chat
            </div>
            <span className="sr-only">Open AI assistant</span>
          </button>
        </div>
      ) : (
        <div ref={chatbotRef} className="fixed bottom-6 right-6 z-60">
          {/* Floating Window */}
          {state !== "closed" && (
            <div
              className="absolute bottom-18 right-0 bg-white rounded-lg shadow-2xl border border-gray-300 transition-all duration-300 w-96 flex flex-col"
              style={{
                height: "calc(100vh - 120px)",
              }}
            >
              {/* Window Header */}
              {renderHeader(true)}
              {viewMode === "chat" && renderUnhighlightButton()}

              {/* Messages area */}
              <div
                className="flex-1 overflow-auto p-4 pr-2 chatbot-scroll"
                ref={floatingMessagesRef}
              >
                {viewMode === "history" ? renderHistory() : renderMessages()}
              </div>

              {/* Input area - only show in chat mode */}
              {viewMode === "chat" &&
                renderInput(
                  "border-t p-4 border-gray-300 bg-white rounded-b-lg",
                )}
            </div>
          )}

          {/* Floating Button */}
          <button
            type="button"
            aria-label={
              state === "closed" ? "Open AI assistant" : "Close AI assistant"
            }
            onClick={handleToggle}
            className="py-2 px-4 cursor-pointer rounded-full shadow-lg flex items-center justify-center transition-all duration-200 bg-green-700 hover:bg-green-800"
          >
            {state === "closed" ? (
              <div className="flex items-center gap-2 text-white">
                <Stars className="h-5 w-5" />
                New Chat
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white">
                <X className="h-5 w-5" />
                Close
              </div>
            )}
            <span className="sr-only">
              {state === "closed" ? "Open AI assistant" : "Close AI assistant"}
            </span>
          </button>
        </div>
      )}
    </>
  );
}
