import { useDraft } from "../../context/DraftContext";
import DraftTimer from "./DraftTimer";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  getLeagueById,
  getSectorByLeagueId,
  type LeagueRow,
} from "../../lib/leagues";
import { useChatbot } from "@/context/ChatbotContext";
import { supabase } from "@/lib/supabase";
import { LogOut, Sparkles } from "lucide-react";
import { getStockById, type StockRow } from "@/lib/stocks";
import LightningBoltIcon from "@/components/ui/lightning-bolt-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DraftHeader = () => {
  const {
    name,
    activePortfolio,
    round,
    draftStarted,
    draftEnded,
    startDraft,
    isOwner,
    leagueId,
    queuedItems,
    myPortfolio,
    draftLoaded,
    draftedStockIds,
  } = useDraft();

  const navigate = useNavigate();
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
  const [league, setLeague] = useState<LeagueRow | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [nextAutoStock, setNextAutoStock] = useState<StockRow | null>(null);
  const [nextAutoSource, setNextAutoSource] = useState<
    "queue" | "market_cap" | null
  >(null);

  // Fetch league info
  useEffect(() => {
    const fetchLeague = async () => {
      const data = await getLeagueById(leagueId);
      setLeague(data);
    };
    fetchLeague();
  }, [leagueId]);

  // Fetch last chat title
  useEffect(() => {
    if (!lastConversationId) {
      setConversationTitle(null);
      return;
    }

    const fetchTitle = async () => {
      const { data } = await supabase
        .from("Chat Conversations")
        .select("title")
        .eq("conversation_id", lastConversationId)
        .single();
      if (data) setConversationTitle(data.title);
    };

    fetchTitle();
  }, [lastConversationId]);

  // Countdown logic
  useEffect(() => {
    if (!league?.start_time) return;

    const startTime = new Date(league.start_time).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(Math.floor((startTime - now) / 1000), 0);
      setCountdown(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [league?.start_time]);

  // Load the next auto-draft stock (top of queue)
  useEffect(() => {
    const loadNextAuto = async () => {
      if (!myPortfolio) {
        setNextAutoStock(null);
        setNextAutoSource(null);
        return;
      }

      if (queuedItems.length > 0) {
        const topItem = queuedItems[0];
        const stock = await getStockById(topItem.stock_id);
        if (stock) {
          setNextAutoStock(stock);
          setNextAutoSource("queue");
          return;
        }
      }

      const leagueSectorFilter = await getSectorByLeagueId(leagueId);

      let query = supabase
        .from("Stocks")
        .select("*")
        .order("market_cap", { ascending: false });

      if (!leagueSectorFilter.includes("Any")) {
        query = query.in("sector", leagueSectorFilter);
      }

      const { data, error } = await query;

      if (error || !data) {
        setNextAutoStock(null);
        setNextAutoSource(null);
        return;
      }

      const topApplicable = (data as StockRow[]).find(
        (stock) => !draftedStockIds.has(stock.stock_id),
      );

      setNextAutoStock(topApplicable ?? null);
      setNextAutoSource(topApplicable ? "market_cap" : null);
    };

    loadNextAuto();
  }, [queuedItems, myPortfolio, leagueId, draftedStockIds]);

  const showCountdownButton =
    draftLoaded &&
    !draftStarted &&
    !draftEnded &&
    countdown > 0 &&
    countdown <= 7 * 24 * 60 * 60;

  const showDraftStartDateTime =
    draftLoaded &&
    !draftStarted &&
    !draftEnded &&
    countdown > 7 * 24 * 60 * 60 &&
    Boolean(league?.start_time);

  const showDraftDetails = draftLoaded && draftStarted && !draftEnded;

  const isMyTurn = activePortfolio?.portfolio_id === myPortfolio?.portfolio_id;

  const showStartDraftButton =
    draftLoaded && !draftStarted && !draftEnded && isOwner;

  const showMobileSecondRow =
    showDraftDetails ||
    showCountdownButton ||
    showDraftStartDateTime ||
    showStartDraftButton;

  const formatTime = (seconds: number) => {
    const units = [
      { label: "year", value: 365 * 24 * 60 * 60 },
      { label: "month", value: 30 * 24 * 60 * 60 },
      { label: "day", value: 24 * 60 * 60 },
      { label: "hour", value: 60 * 60 },
      { label: "minute", value: 60 },
      { label: "second", value: 1 },
    ];

    let remaining = Math.max(0, Math.floor(seconds));
    const parts: string[] = [];

    for (const unit of units) {
      if (parts.length === 2) break;

      const amount = Math.floor(remaining / unit.value);
      if (amount <= 0) continue;

      parts.push(`${amount} ${unit.label}${amount === 1 ? "" : "s"}`);
      remaining -= amount * unit.value;
    }

    return parts.length > 0 ? parts.join(", ") : "0 seconds";
  };

  const formatStartDateTime = (startTime: string) => {
    const startDate = new Date(startTime);
    return startDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const nextUpTooltipMessage =
    nextAutoSource === "queue"
      ? "If time runs out, this stock will be automatically drafted for you (from your queue)."
      : "If time runs out, this stock will be automatically drafted for you (based on highest market cap from applicable stocks).";

  const renderDraftControls = () => (
    <>
      {showDraftDetails && (
        <div className="flex items-center gap-3 text-sm font-medium">
          {nextAutoStock && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-32 flex justify-center items-center gap-1.5">
                      <LightningBoltIcon className="inline-block w-4.5 h-4.5 text-green-600" />
                      <div className="text-center rounded truncate text-[13px]">
                        <div className="flex items-center gap-1 text-gray-500">
                          Next up:
                        </div>
                        <div className="font-semibold text-black flex justify-center items-center">
                          {nextAutoStock.stock_symbol}
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    sideOffset={6}
                    className="text-center max-w-[200px] whitespace-normal"
                  >
                    {nextUpTooltipMessage}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="h-8 w-px bg-gray-300 self-center" />
            </>
          )}

          <div className="w-32 text-center truncate">
            <div
              className={`text-center rounded text-[13px] ${
                isMyTurn ? "text-green-700 font-semibold" : "text-gray-700"
              }`}
            >
              Round {round}
              <div>
                {isMyTurn
                  ? "YOUR TURN"
                  : `${activePortfolio?.Profiles?.username || "Unknown"}'s turn`}
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-gray-300 self-center" />

          <div className="w-32 rounded py-2 text-center tabular-nums">
            <DraftTimer />
          </div>
        </div>
      )}

      {showCountdownButton && (
        <div className="flex-1 text-center text-yellow-600 font-medium">
          Draft Starts in {formatTime(countdown)}
        </div>
      )}

      {showDraftStartDateTime && league?.start_time && (
        <div className="flex-1 text-center text-yellow-600 font-medium">
          Draft starts on {formatStartDateTime(league.start_time)}
        </div>
      )}

      {showStartDraftButton && (
        <Button onClick={startDraft} size="sm">
          Start Draft
        </Button>
      )}
    </>
  );

  return (
    <div className="w-full bg-white border-b border-gray-300">
      <div className="flex w-full h-14">
        <header className="h-14 bg-white flex items-center flex-1 min-w-0">
          <button
            onClick={() => navigate(`/league/${leagueId}`)}
            className="shrink-0 flex gap-1 px-5 items-center cursor-pointer hover:bg-gray-100 h-full border-r border-gray-300 hover:text-green-800"
          >
            <LogOut className="w-4 h-4 scale-x-[-1]" />
            Exit
          </button>

          <h1 className="ml-4 text-lg md:text-xl font-semibold truncate min-w-0 flex-1">
            {name}
          </h1>

          <div className="hidden min-[901px]:flex items-center gap-3 pr-4 shrink-0 justify-center">
            {renderDraftControls()}
          </div>
        </header>

        {chatbotState === "closed" && (
          <div
            onClick={() => {
              const shouldPinChat = window.matchMedia(
                "(min-width: 1024px)",
              ).matches;
              setResumeRequested(Boolean(lastConversationId));
              setChatbotState("floating");
              setIsPinned(shouldPinChat);
            }}
            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-gray-300 bg-white text-sm hover:bg-gray-100 cursor-pointer lg:w-48 lg:items-start lg:px-4"
          >
            <div className="flex gap-1 items-center">
              <Sparkles className="w-6 h-6 lg:w-3 lg:h-3 text-green-700" />
              <p className="hidden lg:block text-green-700 text-xs font-medium">
                {lastConversationId ? "Resume Chat" : "New Chat"}
              </p>
            </div>
            <p className="hidden lg:block text-gray-700 text-xs truncate">
              {lastConversationId
                ? conversationTitle || "Loading..."
                : "Start a new conversation"}
            </p>
          </div>
        )}
      </div>

      {showMobileSecondRow && (
        <div className="hidden max-[900px]:flex items-center justify-end gap-3 px-4 h-14 border-t border-gray-300">
          {renderDraftControls()}
        </div>
      )}
    </div>
  );
};

export default DraftHeader;
