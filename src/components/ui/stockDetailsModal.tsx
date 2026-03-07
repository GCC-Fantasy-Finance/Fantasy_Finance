import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { useAuth } from "@/context/AuthContext";
import { useChatbot } from "@/context/ChatbotContext";
import StockChart from "./stockChart";

// import Sparkles from "@/components/icons/Sparkles";
import { useTradeModal } from "@/context/TradeModalContext";
import Ticker from "@/components/ui/ticker";
import { supabase } from "@/lib/supabase";

import { addWishlistItemStockPage, removeWishlistItem } from "@/lib/wishlists";
import { isStockInDraftPicks } from "@/lib/draftpicks";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  getDayMinMaxStockHistory,
  getYearMinMaxStockHistory,
} from "@/lib/stockHistory";
import AIQuestionChip from "./AIQuestionChip";
import { getPortfoliosByUser } from "@/lib/portfolios";
import { getPortfolioHoldingsByPortfolioIdAndStockId } from "@/lib/potfolioHoldings";
import { useDraftOptional } from "@/context/DraftContext";

interface Stock {
  stock_id?: number;
  stock_symbol?: string;
  name?: string;
  current_price?: number;
  sector?: string;
  previous_close?: any;
  day_range?: any;
  year_range?: any;
  market_cap?: any;
  volume?: any;
  logo_url?: string;
}

interface PortfolioWithLeague {
  portfolio_id: number;
  league_id?: number;
  league_name?: string;
  draft_has_started?: boolean;
  draft_has_ended?: boolean;
  is_solo: boolean;
  reserve_value: number;
  previous_close_value: number;
  created_at?: string;
  sectors: string[];
  wishlisted: boolean;
}

type Props = {
  open: boolean;
  stock: Stock | null;
  onClose: () => void;
};

const AI_QUESTIONS = [
  {
    label: "Is this stock volatile?",
    getMessage: (name: string, symbol: string) =>
      `Is ${name} (${symbol}) a volatile stock?`,
  },
  {
    label: "What is the future outlook for this stock?",
    getMessage: (name: string, symbol: string) =>
      `What is the future outlook for ${name} (${symbol})?`,
  },
  {
    label: "Tell me more",
    getMessage: (name: string, symbol: string) =>
      `Tell me more about ${name} (${symbol})?`,
  },
];

export default function StockDetailsModal({ open, stock, onClose }: Props) {
  const { user } = useAuth();
  const { setChatbotState, setIsPinned, setInitialMessage } = useChatbot();
  const { openBuy, openSell } = useTradeModal();
  const draft = useDraftOptional();

  const [portfolios, setPortfolios] = useState<PortfolioWithLeague[]>([]);
  const [loading, setLoading] = useState(false);
  const [holdings, setHoldings] = useState<Record<number, number>>({});
  const [timeFrame, setTimeFrame] = useState("1D");
  const [stockPrice, setStockPrice] = useState<number | null>(null);
  const [isInDraftPicks, setIsInDraftPicks] = useState<boolean>(true);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(true);
  const [dayRangeDisplay, setDayRangeDisplay] = useState<string>("-");
  const [yearRangeDisplay, setYearRangeDisplay] = useState<string>("-");
  const [activeTab, setActiveTab] = useState<"details" | "trade">("details");

  const formatRangeFallback = (value: any) => {
    if (value == null || value === "") return "-";
    const text = String(value).trim();
    if (!text) return "-";
    return text.includes("$") ? text : `$${text}`;
  };

  /* ================= INIT PRICE ================= */
  useEffect(() => {
    if (!open || stock?.current_price == null) return;
    setStockPrice(stock.current_price);
  }, [open, stock?.current_price]);

  useEffect(() => {
    if (open) {
      setActiveTab("details");
    }
  }, [open, stock?.stock_id]);

  /* ================= REALTIME PRICE ================= */
  useEffect(() => {
    if (!stock?.stock_id) return;

    const channel = supabase
      .channel(`live-stock-prices-${stock.stock_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Stocks",
          filter: `stock_id=eq.${stock.stock_id}`,
        },
        (payload) => {
          const updated = payload.new as {
            stock_id: number;
            current_price: number;
          };
          setStockPrice(updated.current_price);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stock?.stock_id]);

  /* ================= DAY + YEAR RANGE ================= */
  useEffect(() => {
    let mounted = true;

    const fetchRanges = async () => {
      if (!open || !stock?.stock_id) {
        if (mounted) {
          setDetailsLoading(true);
          setDayRangeDisplay("-");
          setYearRangeDisplay("-");
        }
        return;
      }

      if (mounted) setDetailsLoading(true);

      try {
        const [{ min: dayMin, max: dayMax }, { min: yearMin, max: yearMax }] =
          await Promise.all([
            getDayMinMaxStockHistory(stock.stock_id),
            getYearMinMaxStockHistory(stock.stock_id),
          ]);

        if (!mounted) return;

        if (dayMin != null && dayMax != null) {
          setDayRangeDisplay(`$${dayMin.toFixed(2)} - $${dayMax.toFixed(2)}`);
        } else {
          setDayRangeDisplay(formatRangeFallback(stock.day_range));
        }

        if (yearMin != null && yearMax != null) {
          setYearRangeDisplay(
            `$${yearMin.toFixed(2)} - $${yearMax.toFixed(2)}`,
          );
        } else {
          setYearRangeDisplay(formatRangeFallback(stock.year_range));
        }
      } catch (err) {
        console.error("Failed to fetch stock ranges:", err);
        if (mounted) {
          setDayRangeDisplay(formatRangeFallback(stock.day_range));
          setYearRangeDisplay(formatRangeFallback(stock.year_range));
        }
      } finally {
        if (mounted) {
          setDetailsLoading(false);
        }
      }
    };

    fetchRanges();

    return () => {
      mounted = false;
    };
  }, [open, stock?.stock_id, stock?.day_range, stock?.year_range]);

  /* ================= FETCH DATA ================= */
  useEffect(() => {
    const fetchPortfolios = async () => {
      if (!open || !user?.id) {
        setPortfolios([]);
        setHoldings({});
        return;
      }

      setLoading(true);
      try {
        const userPortfolios = await getPortfoliosByUser(
          user.id as unknown as number,
        );

        const portfolioRows = (userPortfolios ?? []) as Array<{
          portfolio_id: number;
          league_id?: number | null;
          is_solo: boolean;
          reserve_value?: number | null;
          previous_close_value?: number | null;
          created_at?: string | null;
        }>;

        const portfolioIds = portfolioRows.map((portfolio) =>
          Number(portfolio.portfolio_id),
        );
        const leagueIds = Array.from(
          new Set(
            portfolioRows
              .map((portfolio) => Number(portfolio.league_id))
              .filter((leagueId) => Number.isFinite(leagueId)),
          ),
        );

        const [leaguesResult, draftsResult, wishlistsResult, holdingsResult] =
          await Promise.all([
            leagueIds.length > 0
              ? supabase
                  .from("Leagues")
                  .select("league_id,name,sectors")
                  .in("league_id", leagueIds)
              : Promise.resolve({ data: [], error: null }),
            leagueIds.length > 0
              ? supabase
                  .from("Drafts")
                  .select("league_id,is_started,is_ended")
                  .in("league_id", leagueIds)
              : Promise.resolve({ data: [], error: null }),
            stock?.stock_id && portfolioIds.length > 0
              ? supabase
                  .from("Wishlist Items")
                  .select("portfolio_id")
                  .in("portfolio_id", portfolioIds)
                  .eq("stock_id", stock.stock_id)
              : Promise.resolve({ data: [], error: null }),
            stock?.stock_id && portfolioIds.length > 0
              ? supabase
                  .from("Portfolio Holdings")
                  .select("portfolio_id,quantity")
                  .in("portfolio_id", portfolioIds)
                  .eq("stock_id", stock.stock_id)
              : Promise.resolve({ data: [], error: null }),
          ]);

        if (leaguesResult.error) throw leaguesResult.error;
        if (draftsResult.error) throw draftsResult.error;
        if (wishlistsResult.error) throw wishlistsResult.error;
        if (holdingsResult.error) throw holdingsResult.error;

        const leagueById = new Map<
          number,
          { name?: string; sectors?: string[] }
        >();
        for (const league of (leaguesResult.data ?? []) as any[]) {
          leagueById.set(Number(league.league_id), {
            name: league.name,
            sectors: Array.isArray(league.sectors) ? league.sectors : [],
          });
        }

        const draftByLeagueId = new Map<
          number,
          { is_started?: boolean; is_ended?: boolean }
        >();
        for (const draft of (draftsResult.data ?? []) as any[]) {
          draftByLeagueId.set(Number(draft.league_id), {
            is_started: Boolean(draft.is_started),
            is_ended: Boolean(draft.is_ended),
          });
        }

        const wishlistedPortfolioIds = new Set<number>(
          ((wishlistsResult.data ?? []) as any[]).map((row) =>
            Number(row.portfolio_id),
          ),
        );

        const holdingsMap: Record<number, number> = {};
        for (const row of (holdingsResult.data ?? []) as any[]) {
          const portfolioId = Number(row.portfolio_id);
          holdingsMap[portfolioId] = Number(row.quantity ?? 0);
        }

        const enriched: PortfolioWithLeague[] = portfolioRows.map(
          (portfolio) => {
            const leagueId = Number(portfolio.league_id);
            const league = leagueById.get(leagueId);
            const draft = draftByLeagueId.get(leagueId);
            const portfolioId = Number(portfolio.portfolio_id);

            return {
              portfolio_id: portfolioId,
              league_id: Number.isFinite(leagueId) ? leagueId : undefined,
              league_name: league?.name,
              is_solo: Boolean(portfolio.is_solo),
              reserve_value: Number(portfolio.reserve_value ?? 0),
              previous_close_value: Number(portfolio.previous_close_value ?? 0),
              created_at: portfolio.created_at ?? undefined,
              sectors: league?.sectors ?? [],
              draft_has_started: Boolean(draft?.is_started),
              draft_has_ended: Boolean(draft?.is_ended),
              wishlisted: wishlistedPortfolioIds.has(portfolioId),
            };
          },
        );

        enriched.sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return aTime - bTime;
        });

        setPortfolios(enriched);
        // setHoldings(holdingsMap);

        if (stock?.stock_id) {
          const map: Record<number, number> = {};
          await Promise.all(
            enriched.map(async (portfolio) => {
              const qty = await getPortfolioHoldingsByPortfolioIdAndStockId(
                portfolio.portfolio_id,
                stock.stock_id!,
              );
              map[portfolio.portfolio_id] = qty ?? 0;
            }),
          );
          setHoldings(map);
        }
      } catch (err) {
        console.error("Failed to fetch portfolios:", err);
        setPortfolios([]);
        setHoldings({});
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolios();
  }, [open, user?.id, stock?.stock_id]);

  // check whether this stock exists in Draft Picks (used to gate buying)
  useEffect(() => {
    const check = async () => {
      if (!open || !stock?.stock_id) {
        setIsInDraftPicks(true);
        return;
      }
      try {
        const exists = await isStockInDraftPicks(stock.stock_id);
        setIsInDraftPicks(exists);
      } catch (err) {
        console.error("Failed to check draft picks for stock:", err);
        setIsInDraftPicks(true);
      }
    };
    check();
  }, [open, stock?.stock_id]);

  /* ================= LIVE DRAFT STATUS ================= */
  useEffect(() => {
    const leagueIds = portfolios
      .map((p) => p.league_id)
      .filter((id): id is number => !!id);

    if (leagueIds.length === 0) return;

    const channel = supabase
      .channel("live-draft-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Drafts",
        },
        (payload) => {
          const updated = payload.new as {
            league_id: number;
            is_started: boolean;
          };

          if (!leagueIds.includes(updated.league_id)) return;

          setPortfolios((prev) =>
            prev.map((p) =>
              p.league_id === updated.league_id
                ? { ...p, has_started: updated.is_started }
                : p,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [portfolios]);

  /* ================= ESC CLOSE ================= */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !stock) return null;

  const handleBuy = (portfolio: PortfolioWithLeague) => {
    if (!stock?.stock_id || stockPrice == null) return;
    openBuy({
      stock: {
        stock_id: stock.stock_id!,
        stock_symbol: stock.stock_symbol ?? "",
        name: stock.name ?? "",
        current_price: stockPrice,
      },
      portfolio: {
        portfolio_id: portfolio.portfolio_id,
        reserve_value: Number(portfolio.reserve_value ?? 0),
      },
    });
  };

  const handleSell = (portfolio: PortfolioWithLeague) => {
    if (!stock?.stock_id || stockPrice == null) return;
    const qty = Number(holdings?.[portfolio.portfolio_id] ?? 0);
    openSell({
      stock: {
        stock_id: stock.stock_id!,
        stock_symbol: stock.stock_symbol ?? "",
        name: stock.name ?? "",
        current_price: stockPrice,
      },
      portfolio: {
        portfolio_id: portfolio.portfolio_id,
        reserve_value: Number(portfolio.reserve_value ?? 0),
      },
      holdingQty: qty,
    });
  };

  const formatDetails = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "decimal",
      maximumFractionDigits: 1,
      notation: "compact",
      compactDisplay: "long",
    }).format(amount);
  };

  const detailSkeleton = (widthClass: string = "w-28") => (
    <span
      className={`inline-block h-3 ${widthClass} rounded bg-gray-200 animate-pulse align-middle`}
    />
  );

  const timeFrameOptions = [
    { value: "1D", label: "1D" },
    { value: "1M", label: "1M" },
    { value: "1Y", label: "1Y" },
  ];

  const modal = (
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-6xl h-[95vh] sm:h-[90vh] rounded bg-white shadow-lg flex flex-col"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        {/* CONTENT */}
        <div className="flex flex-1 min-h-0 flex-col">
          {/* Stock name, symbol, ticker, etc. */}
          <div className="border-b border-gray-200 p-4 sm:p-6 lg:hidden">
            <h2 className="text-2xl font-semibold">
              {stock.name}
              {" – "}
              {stockPrice != null ? `$${stockPrice.toFixed(2)}` : "Loading..."}
              <Ticker
                currentValue={stockPrice ?? undefined}
                previousValue={stock.previous_close ?? undefined}
              />
            </h2>
            <p className="text-gray-600 text-sm flex items-center gap-2 flex-wrap">
              <span>{stock.stock_symbol}</span>
              <img
                src={stock.logo_url}
                alt={`${stock.stock_symbol} logo`}
                className="w-8 h-8 object-cover"
              />
            </p>
          </div>

          {/* Tabs (small screens) */}
          <nav className="lg:hidden h-12 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6">
            <ul className="flex w-full">
              <li className="flex-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("details")}
                  aria-current={activeTab === "details" ? "page" : undefined}
                  className={`relative w-full py-3 transition-colors group cursor-pointer text-center ${
                    activeTab === "details" ? "font-medium text-green-700" : ""
                  }`}
                >
                  <span className="pointer-events-none">Stock Details</span>
                  <span
                    className={`absolute -left-0.5 -right-0.5 h-[2.5px] ${
                      activeTab === "details"
                        ? "bg-green-700"
                        : "bg-transparent group-hover:bg-gray-300"
                    } bottom-0`}
                  />
                </button>
              </li>
              <li className="flex-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("trade")}
                  aria-current={activeTab === "trade" ? "page" : undefined}
                  className={`relative w-full py-3 transition-colors group cursor-pointer text-center ${
                    activeTab === "trade" ? "font-medium text-green-700" : ""
                  }`}
                >
                  <span className="pointer-events-none">Trade Stock</span>
                  <span
                    className={`absolute -left-0.5 -right-0.5 h-[2.5px] ${
                      activeTab === "trade"
                        ? "bg-green-700"
                        : "bg-transparent group-hover:bg-gray-300"
                    } bottom-0`}
                  />
                </button>
              </li>
            </ul>
          </nav>

          <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
            {/* LEFT — CHART + DETAILS + AI */}
            <div
              className={`w-full min-w-0 flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-gray-200 p-4 sm:p-6 overflow-y-auto ${
                activeTab === "details" ? "flex" : "hidden"
              } lg:flex`}
            >
              <div className="hidden lg:block">
                <h2 className="text-2xl font-semibold">
                  {stock.name}
                  {" – "}
                  {stockPrice != null
                    ? `$${stockPrice.toFixed(2)}`
                    : "Loading..."}
                  <Ticker
                    currentValue={stockPrice ?? undefined}
                    previousValue={stock.previous_close ?? undefined}
                  />
                </h2>
                <p className="text-gray-600 text-sm flex items-center gap-2 flex-wrap">
                  <span>{stock.stock_symbol}</span>
                  <img
                    src={stock.logo_url}
                    alt={`${stock.stock_symbol} logo`}
                    className="w-8 h-8 object-cover"
                  />
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                {/* Graph */}
                <div className=" flex flex-col">
                  <div className="w-full flex justify-between">
                    <h4 className="font-medium">Price History</h4>

                    {/* Time Frame Options */}
                    <div className="flex items-center justify-end pb-2 mb-2 gap-2">
                      {timeFrameOptions.map((option, index) => (
                        <span
                          key={option.value}
                          className="flex items-center gap-2"
                        >
                          <button
                            type="button"
                            onClick={() => setTimeFrame(option.value)}
                            aria-pressed={timeFrame === option.value}
                            className={`w-10 text-sm text-center uppercase tracking-wide transition-colors border-b-2 -mb-0.5 pb-1 cursor-pointer ${
                              timeFrame === option.value
                                ? "text-green-700 border-green-700 font-semibold"
                                : "text-gray-400 border-transparent hover:text-gray-700 hover:border-gray-300"
                            }`}
                          >
                            {option.label}
                          </button>
                          {index < timeFrameOptions.length - 1 && (
                            <span
                              className="h-5 w-px bg-gray-300"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  <StockChart id={stock.stock_id || 0} timeFrame={timeFrame} />
                </div>
              </div>

              {/* Stock details */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h4 className="font-medium mb-2">Stock Details</h4>

                <TooltipProvider delayDuration={100}>
                  <table className="w-full border-separate border-spacing-y-2 text-sm text-gray-900">
                    <tbody>
                      <tr>
                        <td className="pr-4 font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default ">
                                Previous Close
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="bg-green-700 text-white text-xs rounded w-56 px-2 py-1"
                            >
                              The closing price of the stock on the previous
                              trading day.
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td>
                          {detailsLoading
                            ? detailSkeleton("w-20")
                            : `$${stock.previous_close?.toFixed(2)}`}
                        </td>
                      </tr>

                      <tr>
                        <td className="pr-4 font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default ">Day Range</span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="bg-green-700 text-white text-xs rounded w-56 px-2 py-1"
                            >
                              The lowest and highest price the stock traded at
                              during the current trading day.
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td>
                          {detailsLoading
                            ? detailSkeleton("w-36")
                            : dayRangeDisplay}
                        </td>
                      </tr>

                      <tr>
                        <td className="pr-4 font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default ">
                                Year Range
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="bg-green-700 text-white text-xs rounded w-56 px-2 py-1"
                            >
                              The lowest and highest price the stock traded at
                              over the past 52 weeks.
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td>
                          {detailsLoading
                            ? detailSkeleton("w-40")
                            : yearRangeDisplay}
                        </td>
                      </tr>

                      <tr>
                        <td className="pr-4 font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default ">
                                Market Cap
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="bg-green-700 text-white text-xs rounded w-56 px-2 py-1"
                            >
                              The total market value of all outstanding shares
                              of the company.
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td>
                          {detailsLoading
                            ? detailSkeleton("w-24")
                            : `${formatDetails(stock.market_cap)} USD`}
                        </td>
                      </tr>

                      <tr>
                        <td className="pr-4 font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default ">Volume</span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="bg-green-700 text-white text-xs rounded w-56 px-2 py-1"
                            >
                              The total number of shares traded during the
                              current trading session.
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td>
                          {detailsLoading
                            ? detailSkeleton("w-20")
                            : formatDetails(stock.volume)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </TooltipProvider>
              </div>

              {/* AI questions */}
              <div className="mb-10">
                <h4 className="font-medium mb-2">Learn More</h4>
                <div className="flex gap-2">
                  {AI_QUESTIONS.map((question) => (
                    <AIQuestionChip
                      key={question.label}
                      label={question.label}
                      onClick={() => {
                        setInitialMessage(
                          question.getMessage(
                            stock.name ?? "",
                            stock.stock_symbol ?? "",
                          ),
                        );
                        setChatbotState("floating");
                        setIsPinned(true);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT — TRADE */}
            <div
              className={`w-full lg:w-[400px] flex flex-col border-t lg:border-t-0 lg:border-l border-gray-200 p-4 sm:p-6 bg-gray-50 overflow-y-auto flex-1 min-h-0 lg:shrink-0 lg:flex-none ${
                activeTab === "trade" ? "flex" : "hidden"
              } lg:flex`}
            >
              <h3 className="text-lg font-semibold mb-4 shrink-0">
                Trade Stock
              </h3>

              <div className="flex-1 min-h-0 space-y-2">
                {loading ? (
                  <p className="text-gray-500 text-sm">Loading portfolios...</p>
                ) : portfolios.length === 0 ? (
                  <p className="text-gray-500 text-sm">No portfolios found.</p>
                ) : (
                  portfolios.map((portfolio) => (
                    <div
                      key={portfolio.portfolio_id}
                      className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between gap-2"
                    >
                      <p className="font-medium text-sm truncate">
                        {portfolio.is_solo
                          ? "Solo"
                          : portfolio.league_name || "Unknown League"}
                      </p>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">
                          ${portfolio.reserve_value.toFixed(2)}
                        </span>

                        {!portfolio.draft_has_ended && !portfolio.is_solo ? (
                          portfolio.wishlisted ? (
                            !portfolio.sectors.includes("Any") &&
                            !portfolio.sectors.includes(stock.sector || "") ? (
                              <Button
                                className="text-xs h-7 px-2 bg-gray-400 text-white cursor-not-allowed"
                                disabled
                                title={`This stock's sector (${stock.sector}) is not allowed in this league. Allowed sectors: ${portfolio.sectors.join(", ")}`}
                              >
                                Unavailable
                              </Button>
                            ) : (
                              <Button
                                className="text-xs h-7 px-2 bg-yellow-500 hover:bg-yellow-600 text-white"
                                onClick={async () => {
                                  setPortfolios((prev) =>
                                    prev.map((p) =>
                                      p.portfolio_id === portfolio.portfolio_id
                                        ? { ...p, wishlisted: false }
                                        : p,
                                    ),
                                  );

                                  await removeWishlistItem(
                                    portfolio.portfolio_id,
                                    stock.stock_id!,
                                  );
                                  draft?.removeFromQueueUI(
                                    stock.stock_id!,
                                    portfolio.portfolio_id,
                                  );
                                }}
                              >
                                Dequeue
                              </Button>
                            )
                          ) : !portfolio.sectors.includes("Any") &&
                            !portfolio.sectors.includes(stock.sector || "") ? (
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      className="text-xs h-7 px-2 bg-gray-400 text-white cursor-not-allowed"
                                      disabled
                                    >
                                      Unavailable
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="bg-black text-white text-xs rounded max-w-56 whitespace-normal wrap-break-word px-2 py-1">
                                  Sector {stock.sector} is not allowed in this
                                  league.
                                  <br />
                                  Allowed sectors:{" "}
                                  {portfolio.sectors.join(", ")}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Button
                              className="text-xs h-7 px-2 bg-yellow-500 hover:bg-yellow-600 text-white"
                              onClick={async () => {
                                setPortfolios((prev) =>
                                  prev.map((p) =>
                                    p.portfolio_id === portfolio.portfolio_id
                                      ? { ...p, wishlisted: true }
                                      : p,
                                  ),
                                );

                                await addWishlistItemStockPage(
                                  portfolio.portfolio_id,
                                  stock.stock_id!,
                                );
                                draft?.addToQueueUI(
                                  stock.stock_id!,
                                  portfolio.portfolio_id,
                                );
                              }}
                            >
                              Queue
                            </Button>
                          )
                        ) : (
                          <>
                            {!portfolio.sectors.includes("Any") &&
                            !portfolio.is_solo &&
                            !portfolio.sectors.includes(stock.sector || "") ? (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        className="text-xs h-7 px-2 bg-gray-400 text-white cursor-not-allowed"
                                        disabled
                                      >
                                        Unavailable
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-black text-white text-xs rounded max-w-56 whitespace-normal wrap-break-word px-2 py-1">
                                    Sector {stock.sector} is not allowed in this
                                    league.
                                    <br />
                                    Allowed sectors:{" "}
                                    {portfolio.sectors.join(", ")}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <>
                                {(portfolio.is_solo || isInDraftPicks) && (
                                  <Button
                                    onClick={() => handleSell(portfolio)}
                                    variant="outline"
                                    disabled={
                                      !(holdings[portfolio.portfolio_id] > 0)
                                    }
                                    className="text-xs h-7 px-2 text-red-600 border-red-300 hover:bg-red-50 disabled:bg-gray-300"
                                  >
                                    – Sell
                                  </Button>
                                )}

                                {!portfolio.is_solo && !isInDraftPicks ? (
                                  <TooltipProvider delayDuration={100}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span>
                                          <Button
                                            disabled
                                            className="text-xs h-7 px-2 bg-gray-400 text-white cursor-not-allowed"
                                          >
                                            Unavailable
                                          </Button>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-black text-white text-xs rounded max-w-56 whitespace-normal wrap-break-word px-2 py-1">
                                        This stock is not in your portfolio.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <Button
                                    onClick={() => handleBuy(portfolio)}
                                    disabled={portfolio.reserve_value <= 0}
                                    className="text-xs h-7 px-2 bg-green-700 hover:bg-green-800 text-white disabled:bg-gray-300"
                                  >
                                    + Buy
                                  </Button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div className="h-20" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
