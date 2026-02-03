import { useEffect, useState, useCallback } from "react";
import { useDraft } from "../../context/DraftContext";
import { getDraftPicksByLeague, type DraftPickRow } from "../../lib/draftpicks";
import { supabase } from "@/lib/supabase";

const SLOT_HEIGHT = 24;
const SLOT_GAP = 2;

interface DraftResultsPanelProps {
  onStockClick: (stockId: number) => void; // Prop to open modal
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
    leagueId,
    myPortfolio,
  } = useDraft();

  // pickedStocks[userId][roundIndex] = stock_id
  const [pickedStocks, setPickedStocks] = useState<Record<string, Record<number, number>>>({});

  // Map stock_id → stock_symbol for display
  const [stocksMap, setStocksMap] = useState<Record<number, string>>({});

  const loadDraftResults = useCallback(async () => {
    if (!draftStarted && !draftEnded) return;
    if (!users.length) return;

    const picks = await getDraftPicksByLeague(leagueId);
    if (!picks.length) {
      setPickedStocks({});
      setStocksMap({});
      return;
    }

    const stockIds = [...new Set(picks.map((p) => p.stock_id))];

    const { data: stocks, error } = await supabase
      .from("Stocks")
      .select("stock_id, stock_symbol")
      .in("stock_id", stockIds);

    if (error) {
      console.error("Failed to load stock symbols:", error);
      return;
    }

    // Build stockId → stockSymbol map
    const map: Record<number, string> = {};
    stocks?.forEach((s) => {
      map[s.stock_id] = s.stock_symbol;
    });
    setStocksMap(map);

    // Build pickedStocks[userId][roundIndex] = stock_id
    const userPicks: Record<string, Record<number, number>> = {};
    picks.forEach((pick: DraftPickRow) => {
      const roundIdx = pick.round_number - 1;
      if (!userPicks[pick.portfolio_id]) userPicks[pick.portfolio_id] = {};
      userPicks[pick.portfolio_id][roundIdx] = pick.stock_id;
    });
    setPickedStocks(userPicks);
  }, [draftStarted, draftEnded, users, leagueId]);

  useEffect(() => {
    loadDraftResults();
  }, [loadDraftResults, round, currentPick, direction]);

  const slotsContainerHeight =
    draftRounds * SLOT_HEIGHT + (draftRounds - 1) * SLOT_GAP;

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        padding: "0 12px",
        boxSizing: "border-box",
        alignItems: "flex-start",
      }}
    >
      {users.map((user, userIdx) => {
        const isMe = user.portfolio_id === myPortfolio?.portfolio_id;

        return (
          <div
            key={user.portfolio_id}
            style={{
              flex: "1 1 0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minWidth: 0,
              background: isMe ? "rgba(34,197,94,0.08)" : "transparent",
              borderRadius: isMe ? "8px" : undefined,
              padding: isMe ? "4px" : undefined,
              boxShadow: isMe
                ? "inset 0 0 0 1px rgba(34,197,94,0.25)"
                : undefined,
            }}
          >
            {/* Username */}
            <div
              style={{
                fontWeight: isMe ? "bold" : "normal",
                marginBottom: "4px",
                fontSize: "0.8rem",
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                width: "100%",
                color: isMe ? "#166534" : undefined,
              }}
            >
              {user?.Profiles?.username ?? "Name not found"}
            </div>

            {/* Slots */}
            <div
              style={{
                height: `${slotsContainerHeight}px`,
                display: "flex",
                flexDirection: "column",
                gap: `${SLOT_GAP}px`,
                width: "100%",
                flexShrink: 0,
              }}
            >
              {Array.from({ length: draftRounds }).map((_, idx) => {
                let isCurrent = false;
                let isPast = false;

                if (draftEnded) {
                  isPast = true;
                } else if (draftStarted) {
                  if (idx === round - 1) {
                    if (userIdx === currentPick) isCurrent = true;
                    else if (
                      (direction === "forward" && userIdx < currentPick) ||
                      (direction === "backward" && userIdx > currentPick)
                    ) {
                      isPast = true;
                    }
                  } else if (idx < round - 1) {
                    isPast = true;
                  }
                }

                let background = "#fff";
                let color = "#6b7280";
                let border = "1px solid #e5e7eb";

                const stockId = pickedStocks[user.portfolio_id]?.[idx];
                const text = stockId ? stocksMap[stockId] : "";

                if (isPast) {
                  background = "#f3f4f6";
                  color = "#374151";
                  border = "1px solid #d1d5db";
                }

                if (isCurrent) {
                  background = "#2563eb";
                  color = "#fff";
                  border = "2px solid #2563eb";
                }

                return (
                  <div
                    key={idx}
                    style={{
                      height: `${SLOT_HEIGHT}px`,
                      width: "100%",
                      background,
                      border,
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.8rem",
                      fontWeight: isPast || isCurrent ? "bold" : "normal",
                      color,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      boxSizing: "border-box",
                      flexShrink: 0,
                      cursor: stockId ? "pointer" : "default",
                    }}
                    onClick={() => {
                      if (stockId) onStockClick(stockId);
                    }}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DraftResultsPanel;