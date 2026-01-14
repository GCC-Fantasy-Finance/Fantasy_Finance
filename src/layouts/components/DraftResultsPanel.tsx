import { useEffect, useState, useCallback } from "react";
import { useDraft } from "../../context/DraftContext";
import { getDraftPicksByLeague, type DraftPickRow } from "../../lib/draftpicks";
import { supabase } from "@/lib/supabase";

const SLOT_HEIGHT = 24;
const SLOT_GAP = 2;

const DraftResultsPanel = () => {
  const {
    users,
    currentPick,
    round,
    direction,
    draftStarted,
    draftEnded,
    draftRounds,
    leagueId,
  } = useDraft();

  const [pickedStocks, setPickedStocks] = useState<
    Record<string, Record<number, string>>
  >({});

  const loadDraftResults = useCallback(async () => {
    if (!draftStarted && !draftEnded) return;
    if (!users.length) return;

    const picks = await getDraftPicksByLeague(leagueId);
    if (!picks.length) {
      setPickedStocks({});
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

    const stockMap: Record<number, string> = {};
    stocks?.forEach((s) => {
      stockMap[s.stock_id] = s.stock_symbol;
    });

    const map: Record<string, Record<number, string>> = {};

    picks.forEach((pick: DraftPickRow) => {
      const roundIdx = pick.round_number - 1;
      if (!map[pick.portfolio_id]) map[pick.portfolio_id] = {};
      map[pick.portfolio_id][roundIdx] =
        stockMap[pick.stock_id] ?? "";
    });

    setPickedStocks(map);
  }, [draftStarted, draftEnded, users, leagueId]);

  useEffect(() => {
    loadDraftResults();
  }, [loadDraftResults, round, currentPick, direction]);

  /** TOTAL FIXED HEIGHT */
  const slotsContainerHeight =
    draftRounds * SLOT_HEIGHT +
    (draftRounds - 1) * SLOT_GAP;

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        padding: "0 12px",
        boxSizing: "border-box",
        alignItems: "flex-start", // no vertical stretching
      }}
    >
      {users.map((user, userIdx) => (
        <div
          key={user.portfolio_id}
          style={{
            flex: "1 1 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minWidth: 0,
          }}
        >
          {/* Username */}
          <div
            style={{
              fontWeight: "bold",
              marginBottom: "4px",
              fontSize: "0.8rem",
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%",
            }}
          >
            {user?.Profiles?.username ?? "Name not found"}
          </div>

          {/* FIXED-HEIGHT SLOTS CONTAINER */}
          <div
            style={{
              height: `${slotsContainerHeight}px`,
              display: "flex",
              flexDirection: "column",
              gap: `${SLOT_GAP}px`,
              width: "100%",
              flexShrink: 0, // prevent compression
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
              let text = "";

              if (isPast) {
                background = "#f3f4f6";
                color = "#374151";
                border = "1px solid #d1d5db";
                text =
                  pickedStocks[user.portfolio_id]?.[idx] ?? "";
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
                    fontWeight:
                      isPast || isCurrent ? "bold" : "normal",
                    color,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    boxSizing: "border-box",
                    flexShrink: 0, // cannot resize
                  }}
                >
                  {text}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DraftResultsPanel;