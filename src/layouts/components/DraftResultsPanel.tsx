import { useEffect, useState, useCallback } from "react";
import { useDraft } from "../../context/DraftContext";
import { getDraftPicksByLeague, type DraftPickRow } from "../../lib/draftpicks";
import { supabase } from "@/lib/supabase";

const DraftResultsPanel = () => {
  const {
    users,
    currentPick,
    round,
    direction,
    draftStarted,
    draftEnded,
    draftRounds,
    leagueId, // draft_id === leagueId
  } = useDraft();

  // portfolio_id -> roundIndex -> stock symbol
  const [pickedStocks, setPickedStocks] = useState<
    Record<string, Record<number, string>>
  >({});

  /* ================================
     Load draft results
     ================================ */
  const loadDraftResults = useCallback(async () => {
    if (!draftStarted && !draftEnded) return;
    if (!users.length) return;

    // 1️⃣ Get all picks for this draft (draft_id === leagueId)
    const picks = await getDraftPicksByLeague(leagueId);

    if (!picks.length) {
      setPickedStocks({});
      return;
    }

    // 2️⃣ Fetch all stock symbols in one query
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

    // 3️⃣ Build lookup: portfolio_id -> roundIndex -> stock symbol
    const map: Record<string, Record<number, string>> = {};

    picks.forEach((pick: DraftPickRow) => {
      const roundIdx = pick.round_number - 1;
      if (!map[pick.portfolio_id]) {
        map[pick.portfolio_id] = {};
      }
      map[pick.portfolio_id][roundIdx] =
        stockMap[pick.stock_id] ?? "";
    });

    setPickedStocks(map);
  }, [draftStarted, draftEnded, users, leagueId]);

  /* ================================
     Re-fetch when draft advances
     ================================ */
  useEffect(() => {
    loadDraftResults();
  }, [
    loadDraftResults,
    round,
    currentPick,
    direction,
  ]);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {users.map((user, userIdx) => (
        <div
          key={user.portfolio_id}
          style={{
            flex: 1,
            padding: "0.5rem",
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
              marginBottom: "0.5rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%",
              textAlign: "center",
            }}
          >
            {user?.Profiles?.username ?? "Name not found"}
          </div>

          {/* Draft slots */}
          {Array.from({ length: draftRounds }).map((_, idx) => {
            let isCurrent = false;
            let isPast = false;

            if (draftEnded) {
              isPast = true;
            } else if (draftStarted) {
              if (idx === round - 1) {
                if (userIdx === currentPick) {
                  isCurrent = true;
                } else if (
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
                  width: "90%",
                  minHeight: "32px",
                  margin: "0.2rem 0",
                  background,
                  border,
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: isPast || isCurrent ? "bold" : "normal",
                  color,
                  fontSize: "0.95rem",
                }}
              >
                {text}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default DraftResultsPanel;