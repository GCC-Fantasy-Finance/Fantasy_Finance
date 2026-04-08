import { useEffect, useState, useCallback } from "react";
import { useDraft } from "../../context/DraftContext";
import { supabase } from "@/lib/supabase";
import { Check, Minus, X } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SLOT_HEIGHT = 32;
const SLOT_GAP = 2;
const USER_COLUMN_WIDTH = 200; // fixed width per user column
const USER_COLUMN_MAX_WIDTH = 200;

interface DraftResultsPanelProps {
  onStockClick: (stockId: number) => void;
}

const DraftResultsPanel = ({ onStockClick }: DraftResultsPanelProps) => {
  const {
    users,
    currentPick,
    round,
    direction,
    draftStarted,
    draftEnded,
    draftRounds,
    myPortfolio,
    activeUsers,
    draftPicks,
  } = useDraft();

  const [pickedStocks, setPickedStocks] = useState<
    Record<string, Record<number, number>>
  >({});
  const [stocksMap, setStocksMap] = useState<Record<number, string>>({});

  const loadDraftResults = useCallback(async () => {
    if (!draftStarted && !draftEnded) return;
    if (!draftPicks.length) {
      setPickedStocks({});
      setStocksMap({});
      return;
    }

    // Extract unique stock IDs from context draftPicks
    const stockIds = [...new Set(draftPicks.map((p) => p.stock_id))];

    const { data: stocks, error } = await supabase
      .from("Stocks")
      .select("stock_id, stock_symbol")
      .in("stock_id", stockIds);

    if (error) {
      console.error("Failed to load stock symbols:", error);
      return;
    }

    const map: Record<number, string> = {};
    stocks?.forEach((s) => {
      map[s.stock_id] = s.stock_symbol;
    });
    setStocksMap(map);

    // Transform draftPicks array into pickedStocks structure
    const userPicks: Record<string, Record<number, number>> = {};
    draftPicks.forEach((pick) => {
      if (pick.temp) return; // Skip temporary optimistic picks for now, but show them
      const roundIdx = pick.round_number - 1;
      if (!userPicks[pick.portfolio_id]) userPicks[pick.portfolio_id] = {};
      userPicks[pick.portfolio_id][roundIdx] = pick.stock_id;
    });

    // Also include temp picks in the display
    draftPicks.forEach((pick) => {
      if (!pick.temp) return; // Only temp picks here
      const roundIdx = pick.round_number - 1;
      if (!userPicks[pick.portfolio_id]) userPicks[pick.portfolio_id] = {};
      userPicks[pick.portfolio_id][roundIdx] = pick.stock_id;
    });

    setPickedStocks(userPicks);
  }, [draftStarted, draftEnded, draftPicks]);

  useEffect(() => {
    loadDraftResults();
  }, [loadDraftResults]);

  const slotsContainerHeight =
    draftRounds * SLOT_HEIGHT + (draftRounds - 1) * SLOT_GAP;

  // Helper to determine presence state
  const getPresenceState = (userId: string) => {
    const presenceArr = activeUsers[userId];
    return !presenceArr || presenceArr.length === 0 ? "offline" : presenceArr.some((p: any) => p.tab_visible) ? "active" : "away";
  };

  return (
    <TooltipProvider delayDuration={200}>
      <section className="w-full overflow-x-auto pt-3" aria-label="Draft picks overview">
        <div className="mx-auto flex w-max min-w-full justify-center gap-1 px-3 items-start">
          {users.map((user, userIdx) => {
            const isMe = user.portfolio_id === myPortfolio?.portfolio_id;
            const presence = getPresenceState(user.user_id);
            const username = user?.Profiles?.username ?? "Name not found";

            // Choose color, icon, and tooltip based on presence state
            let bgColor = "bg-gray-500";
            let presenceIcon = (
              <X size={10} className="text-white" strokeWidth={3} />
            );
            let presenceTooltip = "is not present";

            if (presence === "active") {
              bgColor = "bg-green-500";
              presenceIcon = (
                <Check size={10} className="text-white" strokeWidth={4} />
              );
              presenceTooltip = "is in draft room!";
            } else if (presence === "away") {
              bgColor = "bg-yellow-400";
              presenceIcon = (
                <Minus size={10} className="text-white" strokeWidth={4} />
              );
              presenceTooltip = "will be right back!";
            }

            return (
              <div
                key={user.portfolio_id}
                className={`flex flex-col items-center flex-none`}
                style={{
                  minWidth: USER_COLUMN_WIDTH,
                  maxWidth: USER_COLUMN_MAX_WIDTH,
                }}
              >
                <div
                  className={`flex flex-col items-center w-full ${
                    isMe
                      ? "bg-green-700/10 border border-green-700/50 rounded-md p-2"
                      : "p-2"
                  }`}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex items-center gap-1.5 font-semibold mb-1 text-[0.8rem] text-center w-full justify-center truncate ${
                          isMe ? "text-green-800" : ""
                        }`}
                      >
                        <div
                          className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center overflow-hidden ${bgColor}`}
                        >
                          {presenceIcon}
                        </div>
                        <span className="truncate">{username}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-black text-white text-xs rounded max-w-56 whitespace-normal wrap-break-word px-2 py-1">
                      {username} {presenceTooltip}
                    </TooltipContent>
                  </Tooltip>

                  <div
                    style={{ height: `${slotsContainerHeight}px` }}
                    className="flex flex-col gap-0.5 w-full shrink-0"
                  >
                    {Array.from({ length: draftRounds }).map((_, idx) => {
                      const roundNumber = idx + 1;
                      const pickInRound =
                        idx % 2 === 0 ? userIdx + 1 : users.length - userIdx;

                      let isCurrent = false;
                      let isPast = false;

                      if (draftEnded) {
                        isPast = true;
                      } else if (draftStarted) {
                        if (idx === round - 1) {
                          if (userIdx === currentPick) isCurrent = true;
                          else if (
                            (direction === "forward" &&
                              userIdx < currentPick) ||
                            (direction === "backward" && userIdx > currentPick)
                          ) {
                            isPast = true;
                          }
                        } else if (idx < round - 1) {
                          isPast = true;
                        }
                      }

                      const stockId = pickedStocks[user.portfolio_id]?.[idx];
                      const text = stockId ? stocksMap[stockId] : "";

                      const pastPickClass =
                        stockId && isPast
                          ? "hover:bg-green-100/60 cursor-pointer"
                          : "";

                      return (
                        <div
                          key={idx}
                          style={{ height: `${SLOT_HEIGHT}px` }}
                          className={`relative w-full rounded flex items-center justify-center text-[0.8rem] overflow-hidden truncate font-semibold transition-colors duration-150
                          ${
                            isCurrent
                              ? isMe
                                ? "bg-green-800 text-white border-2 border-green-800"
                                : "bg-gray-500 text-white border-2 border-gray-500"
                              : isPast
                                ? `bg-white text-gray-700 border border-gray-300 ${pastPickClass}`
                                : "bg-white text-gray-500 border border-gray-300"
                          }`}
                          onClick={() => {
                            if (stockId) onStockClick(stockId);
                          }}
                        >
                          <span className="absolute top-0 right-1 text-[0.6rem] font-medium text-gray-600 pointer-events-none">
                            {roundNumber}.{pickInRound}
                          </span>
                          {text}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </TooltipProvider>
  );
};

export default DraftResultsPanel;
