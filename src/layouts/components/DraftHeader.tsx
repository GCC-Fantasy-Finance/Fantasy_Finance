import { useDraft } from "../../context/DraftContext";
import DraftTimer from "./DraftTimer";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getLeagueById, type LeagueRow } from "../../lib/leagues";
import { useChatbot } from "@/context/ChatbotContext";
import { supabase } from "@/lib/supabase";
import { Sparkles } from "lucide-react";
import { getStockById, type StockRow } from "@/lib/stocks";

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
    timer,
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
    draftLoaded && !draftStarted && !draftEnded && countdown > 0 && !isOwner;

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <>
      <div className="flex w-full h-12">
        <header className="h-12 bg-white border-b border-gray-300 flex items-center justify-between px-6 w-full">
          {/* Left: Back + League Name */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/league/${leagueId}`)}
              className="border-black text-black bg-white hover:bg-gray-100"
            >
              ← Back
            </Button>
            <h1 className="text-xl font-semibold">{name}</h1>
          </div>

          <div className="flex-1" />

          {/* Right-side controls */}
          <div className="flex items-stretch gap-3">
            {draftLoaded && draftStarted && !draftEnded && timer !== null && (
              <div className="flex items-center gap-3 text-sm font-medium">
                {/* Next Auto Draft */}
                <div className="w-44 flex justify-center">
                  {nextAutoStock && (
                    <div className="w-full text-center border-2 border-dashed border-green-500 rounded-md px-2 py-0.5 text-xs font-semibold text-green-500 bg-white truncate">
                      Next up: {nextAutoStock.stock_symbol}
                    </div>
                  )}
                </div>

                {/* Round + Current Pick */}
                <div className="w-40 text-center truncate">
                  Round {round} |{" "}
                  {activePortfolio?.Profiles?.username ?? "Name not found"}
                </div>

                {/* Timer */}
                <div className="w-30 text-center tabular-nums">
                  <DraftTimer />
                </div>
              </div>
            )}

            {showCountdownButton && (
              <Button
                variant="outline"
                size="sm"
                className="w-50 border-black text-black bg-white hover:bg-white"
                disabled
              >
                <span style={{ marginLeft: "1rem", fontWeight: "bold" }}>
                  Draft Starts in {formatTime(countdown)}
                </span>
              </Button>
            )}

            {draftLoaded && !draftStarted && !draftEnded && isOwner && (
              <Button onClick={startDraft} size="sm">
                Start Draft
              </Button>
            )}
          </div>
        </header>

        {/* Resume Chat */}
        {chatbotState === "closed" && (
          <div
            onClick={() => {
              setResumeRequested(Boolean(lastConversationId));
              setChatbotState("floating");
              setIsPinned(true);
            }}
            className="w-48 flex flex-col gap-0.5 justify-center px-4 text-sm border-b border-l border-gray-300 hover:bg-gray-100 cursor-pointer"
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
    </>
  );
};

export default DraftHeader;
