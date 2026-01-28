import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getPortfoliosByLeague } from "../lib/portfolios";
import { getDraftByLeague, type Portfolio } from "../lib/drafts";
import { addWishlistItem, getWishlistByPortfolio, removeWishlistItem, type WishlistItem } from "../lib/wishlists";
import { getLeagueById, type LeagueRow } from "../lib/leagues";

const SERVER_URL = import.meta.env.VITE_DRAFT_SERVER_URL || "http://localhost:4000";

type DraftContextType = {
  users: Portfolio[];
  leagueId: number;
  name: string | null;
  currentPick: number;
  round: number;
  direction: "forward" | "backward";
  timer: number;
  draftStarted: boolean;
  draftEnded: boolean;
  draftRounds: number;
  activePortfolio: Portfolio | undefined;
  myPortfolio: Portfolio | undefined;
  isOwner: boolean;
  queuedItems: WishlistItem[];
  draftPicks: any[];
  startDraft: () => Promise<void>;
  makePick: (stockId: number) => Promise<void>;
  queueStock: (stockId: number) => Promise<void>;
  removeFromQueue: (stockId: number) => Promise<void>;
};

const DraftContext = createContext<DraftContextType | undefined>(undefined);

export const DraftProvider = ({ leagueId, children }: { leagueId: number; children: ReactNode }) => {
  const [users, setUsers] = useState<Portfolio[]>([]);
  const usersRef = useRef<Portfolio[]>([]);
  const [draftPicks, setDraftPicks] = useState<any[]>([]);

  const [currentPortfolioId, setCurrentPortfolioId] = useState<number | null>(null);
  const [currentPick, setCurrentPick] = useState(0);
  const [round, setRound] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [timerStartTime, setTimerStartTime] = useState<string | null>(null);
  const [timer, setTimer] = useState(10);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftEnded, setDraftEnded] = useState(false);
  const [draftRounds, setDraftRounds] = useState(0);

  const intervalRef = useRef<number | null>(null);

  const activePortfolio = users.find(u => u.portfolio_id === currentPortfolioId);
  const [myPortfolio, setMyPortfolio] = useState<Portfolio | undefined>();
  const [league, setLeague] = useState<LeagueRow | null>(null);

  const isOwner = !!league && !!myPortfolio && league.owner_id === myPortfolio.user_id;
  const [queuedItems, setQueuedItems] = useState<WishlistItem[]>([]);

  // --- Initial load ---
  useEffect(() => {
    (async () => {
      const [userData, draftData, leagueData, picksData] = await Promise.all([
        getPortfoliosByLeague(leagueId),
        getDraftByLeague(leagueId),
        getLeagueById(leagueId),
        supabase.from("Draft Picks").select("*").eq("draft_id", leagueId).order("pick_number"),
      ]);

      setUsers(userData ?? []);
      usersRef.current = userData ?? [];

      if (draftData) hydrateFromDraftRow(draftData);
      if (leagueData) setLeague(leagueData);
      setDraftPicks(picksData.data ?? []);
    })();
  }, [leagueId]);

  // --- Draft realtime ---
  useEffect(() => {
    const channel = supabase
      .channel(`drafts-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Drafts", filter: `league_id=eq.${leagueId}` },
        (payload) => hydrateFromDraftRow(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  // --- Picks realtime ---
  // useEffect(() => {
  //   const channel = supabase
  //     .channel(`draftpicks-${leagueId}`)
  //     .on(
  //       "postgres_changes",
  //       { event: "*", schema: "public", table: "Draft Picks", filter: `draft_id=eq.${leagueId}` },
  //       async () => {
  //         const { data } = await supabase
  //           .from("Draft Picks")
  //           .select("*")
  //           .eq("draft_id", leagueId)
  //           .order("pick_number");
  //         setDraftPicks(data ?? []);
  //       }
  //     )
  //     .subscribe();

  //   return () => {
  //     supabase.removeChannel(channel);
  //   };
  // }, [leagueId]);

  // --- Refresh my queue whenever draft picks change (stock drafted by anyone) ---
  // useEffect(() => {
  //   if (!myPortfolio?.portfolio_id) return;
  //   console.log("refreshing queue");
  //   const refreshQueue = async () => {
  //     const updated = await getWishlistByPortfolio(myPortfolio.portfolio_id);
  //     setQueuedItems(updated ?? []);
  //   };

  //   refreshQueue();
  // }, [draftPicks, myPortfolio?.portfolio_id]);

  // --- Function to refresh queue ---
  // const refreshQueue = async () => {
  //   console.log("enter refresh");
  //   if (!myPortfolio?.portfolio_id) return;
  //   console.log(queuedItems);
  //   const updated = await getWishlistByPortfolio(myPortfolio.portfolio_id);
  //   setQueuedItems(updated ?? []);
  //   console.log(queuedItems);
  // };

  useEffect(() => {
    if (!myPortfolio?.portfolio_id) return;

    const refreshQueue = async () => {
      console.log("Refreshing queue after draft update");
      const updated = await getWishlistByPortfolio(myPortfolio.portfolio_id);
      setQueuedItems(updated ?? []);
    };
    
    refreshQueue();
  }, [
    myPortfolio?.portfolio_id,
    currentPortfolioId,
    round
  ]);


  // --- Resolve my portfolio ---
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const mine = usersRef.current.find((p) => p.user_id === user.id);
      setMyPortfolio(mine);
    })();
  }, [users]);

  // --- Hydrate from draft row ---
  const hydrateFromDraftRow = async (d: any) => {
    setDraftStarted(d.is_started);
    setDraftEnded(d.is_ended);
    setDraftRounds(d.total_rounds);
    setRound(d.current_round);
    setDirection(d.is_snaking_forward ? "forward" : "backward");
    setTimerStartTime(d.timer_start_time ?? null);
    setCurrentPortfolioId(d.current_portfolio_id);
  };

  // --- UI index from DB ---
  useEffect(() => {
    if (currentPortfolioId == null || users.length === 0) return;
    const idx = users.findIndex(u => u.portfolio_id === currentPortfolioId);
    if (idx !== -1) setCurrentPick(idx);
  }, [currentPortfolioId, users]);

  // --- Timer logic ---
  useEffect(() => {
    if (!timerStartTime) {
      setTimer(10);
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    const update = () => {
      const start = Date.parse(timerStartTime);
      const now = Date.now();
      const elapsed = Math.max(Math.round((now - start) / 1000), 0);
      setTimer(Math.max(10 - elapsed, 0));
    };

    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerStartTime]);

  // --- Start draft ---
  const startDraft = async () => {
    await fetch(`${SERVER_URL}/draft/${leagueId}/start`, { method: "POST" });
  };

  // --- Queue a stock ---
  const queueStock = async (stockId: number) => {
    if (!myPortfolio?.portfolio_id) return;
    if (queuedItems.some(i => i.stock_id === stockId)) return;

    const optimisticItem: WishlistItem = { portfolio_id: myPortfolio.portfolio_id, stock_id: stockId };
    setQueuedItems(prev => [...prev, optimisticItem]);

    try {
      await addWishlistItem({ portfolio_id: myPortfolio.portfolio_id, stock_id: stockId });
    } catch {
      setQueuedItems(prev => prev.filter(i => i.stock_id !== stockId));
    }
  };

  // Remove stock from queue
  const removeFromQueue = async (stockId: number) => {
    if (!myPortfolio?.portfolio_id) return;
    if (!queuedItems.some(i => i.stock_id === stockId)) return; // make sure the stock is queued

    setQueuedItems(prev => prev.filter(item => item.stock_id !== stockId));
    console.log(queuedItems);
    try {
      await removeWishlistItem(myPortfolio.portfolio_id, stockId);
    } catch {
      console.log("in catch");
    }
  };

  // --- Make a pick ---
  const makePick = async (stockId: number) => {
    if (!currentPortfolioId) return;

    await fetch(`${SERVER_URL}/draft/${leagueId}/pick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: currentPortfolioId,
        stockId,
        round,
        pickNumber: draftPicks.length + 1,
      }),
    });
  };

  return (
    <DraftContext.Provider
      value={{
        users,
        leagueId,
        name: league?.name ?? null,
        currentPick,
        round,
        direction,
        timer,
        draftStarted,
        draftEnded,
        draftRounds,
        activePortfolio,
        myPortfolio,
        isOwner,
        queuedItems,
        draftPicks,
        startDraft,
        makePick,
        queueStock,
        removeFromQueue,
      }}
    >
      {children}
    </DraftContext.Provider>
  );
};

export const useDraft = () => {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within DraftProvider");
  return ctx;
};