import { useDraft } from "../../context/DraftContext";
import DraftTimer from "./DraftTimer";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getLeagueById, type LeagueRow } from "../../lib/leagues";
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

  useEffect(() => {
    const fetchLeague = async () => {
      const data = await getLeagueById(leagueId);
      setLeague(data);
    };
    fetchLeague();
  }, [leagueId]);

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

  useEffect(() => {
    const loadNextAuto = async () => {
      if (!myPortfolio || queuedItems.length === 0) {
        setNextAutoStock(null);
        return;
      }

      const topItem = queuedItems[0];
      const stock = await getStockById(topItem.stock_id);
      setNextAutoStock(stock ?? null);
    };

    loadNextAuto();
  }, [queuedItems, myPortfolio]);

  const showCountdownButton =
    !draftStarted && !draftEnded && countdown > 0 && !isOwner;

  const showDraftDetails = draftStarted && !draftEnded;

  const showStartDraftButton = !draftStarted && !draftEnded && isOwner;

  const showMobileSecondRow =
    showDraftDetails || showCountdownButton || showStartDraftButton;

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

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
                        <div className="font-semibold text-black flex justify-center items-center gap-0.5">
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
                    This is the next stock that will be automatically drafted
                    for you based on your queue.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="h-8 w-px bg-gray-300 self-center" />
            </>
          )}

          <div className="w-32 text-center truncate text-green-700 font-medium">
            <div className="text-center rounded text-[13px]">
              Round {round}
              <div className="text-black">
                {activePortfolio?.Profiles?.username ?? "Name not found"}
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
        <Button
          variant="outline"
          size="sm"
          className="w-42 border-black text-black bg-white hover:bg-white"
          disabled
        >
          <span className="font-semibold">
            Draft Starts in {formatTime(countdown)}
          </span>
        </Button>
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

          <div className="hidden min-[901px]:flex items-stretch gap-3 pr-4 shrink-0">
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
