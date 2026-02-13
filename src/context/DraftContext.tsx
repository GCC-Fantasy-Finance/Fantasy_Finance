import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getPortfoliosByLeague } from "../lib/portfolios";
import { getDraftByLeague, type Portfolio } from "../lib/drafts";
import {
  addWishlistItem,
  getWishlistByPortfolio,
  removeWishlistItem,
  updateWishlistOrder,
  type WishlistItem
} from "../lib/wishlists";
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
  draftedStockIds: Set<number>; // ✅ NEW
  stockPrices: Record<number, number>;
  startDraft: () => Promise<void>;
  makePick: (stockId: number) => Promise<void>;
  queueStock: (stockId: number) => Promise<void>;
  removeFromQueue: (stockId: number) => Promise<void>;
  reorderQueue: (from: number, to: number) => void;
};

const DraftContext = createContext<DraftContextType | undefined>(undefined);

export const DraftProvider = ({ leagueId, children }: { leagueId: number; children: ReactNode }) => {
  const [users, setUsers] = useState<Portfolio[]>([]);
  const usersRef = useRef<Portfolio[]>([]);
  const [draftPicks, setDraftPicks] = useState<any[]>([]);
  const [draftedStockIds, setDraftedStockIds] = useState<Set<number>>(new Set()); // ✅ NEW

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
  const [stockPrices, setStockPrices] = useState<Record<number, number>>({});

  // 🧠 Build drafted stock lookup set whenever picks change
  useEffect(() => {
    const ids = new Set<number>();
    draftPicks.forEach(p => ids.add(p.stock_id));
    setDraftedStockIds(ids);
  }, [draftPicks]);

  // Initial load
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

  // 🔄 Function to refresh picks
  const refreshDraftPicks = async () => {
    const { data, error } = await supabase
      .from("Draft Picks")
      .select("*")
      .eq("draft_id", leagueId)
      .order("pick_number");

    if (error) {
      console.error("Failed to refresh draft picks", error);
      return;
    }

    setDraftPicks(data ?? []);
  };

  // Draft realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`drafts-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Drafts", filter: `league_id=eq.${leagueId}` },
        async (payload) => {
          hydrateFromDraftRow(payload.new);
          await refreshDraftPicks(); // ✅ pull new picks after every draft update
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  // Live stock price updates
  useEffect(() => {
    const channel = supabase
      .channel("live-stock-prices")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Stocks" },
        (payload) => {
          const updated = payload.new as { stock_id: number; current_price: number };
          setStockPrices(prev => ({
            ...prev,
            [updated.stock_id]: updated.current_price,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load initial prices for queued stocks
  useEffect(() => {
    const loadInitialPrices = async () => {
      const ids = queuedItems.map(q => q.stock_id);
      if (ids.length === 0) return;

      const { data } = await supabase
        .from("Stocks")
        .select("stock_id, current_price")
        .in("stock_id", ids);

      if (!data) return;

      const map: Record<number, number> = {};
      for (const row of data) map[row.stock_id] = row.current_price;

      setStockPrices(prev => ({ ...prev, ...map }));
    };

    loadInitialPrices();
  }, [queuedItems]);

  // Refresh queue when draft state changes
  useEffect(() => {
    if (!myPortfolio?.portfolio_id) return;

    const refreshQueue = async () => {
      const updated = await getWishlistByPortfolio(myPortfolio.portfolio_id);
      setQueuedItems(updated ?? []);
    };

    refreshQueue();
  }, [myPortfolio?.portfolio_id, currentPortfolioId, round]);

  // Resolve my portfolio
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const mine = usersRef.current.find((p) => p.user_id === user.id);
      setMyPortfolio(mine);
    })();
  }, [users]);

  const hydrateFromDraftRow = (d: any) => {
    setDraftStarted(d.is_started);
    setDraftEnded(d.is_ended);
    setDraftRounds(d.total_rounds);
    setRound(d.current_round);
    setDirection(d.is_snaking_forward ? "forward" : "backward");
    setTimerStartTime(d.timer_start_time ?? null);
    setCurrentPortfolioId(d.current_portfolio_id);
  };

  const reorderQueue = (from: number, to: number) => {
    setQueuedItems(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);

      if (myPortfolio?.portfolio_id) {
        updateWishlistOrder(updated).catch(console.error);
      }

      return updated;
    });
  };

  useEffect(() => {
    if (currentPortfolioId == null || users.length === 0) return;
    const idx = users.findIndex(u => u.portfolio_id === currentPortfolioId);
    if (idx !== -1) setCurrentPick(idx);
  }, [currentPortfolioId, users]);

  // Timer logic
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
    intervalRef.current = window.setInterval(update, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerStartTime]);

  const startDraft = async () => {
    await fetch(`${SERVER_URL}/draft/${leagueId}/start`, { method: "POST" });
  };

  const queueStock = async (stockId: number) => {
    if (!myPortfolio?.portfolio_id) return;
    if (queuedItems.some(i => i.stock_id === stockId)) return;

    try {
      const newItem = await addWishlistItem({
        portfolio_id: myPortfolio.portfolio_id,
        stock_id: stockId,
      });

      setQueuedItems(prev => [...prev, newItem]);
    } catch (err) {
      console.error("Failed to queue stock", err);
    }
  };

  const removeFromQueue = async (stockId: number) => {
    if (!myPortfolio?.portfolio_id) return;

    setQueuedItems(prev => prev.filter(item => item.stock_id !== stockId));

    try {
      await removeWishlistItem(myPortfolio.portfolio_id, stockId);
    } catch (err) {
      console.error("Failed to remove item", err);
    }
  };

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
        draftedStockIds, // ✅ EXPOSED
        stockPrices,
        startDraft,
        makePick,
        queueStock,
        removeFromQueue,
        reorderQueue,
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