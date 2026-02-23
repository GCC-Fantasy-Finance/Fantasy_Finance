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

const SERVER_URL = "https://nonalgebraical-arduously-kylie.ngrok-free.dev";

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
  queuedLoaded: boolean;
  draftPicks: any[];
  draftedStockIds: Set<number>;
  stockPrices: Record<number, number>;
  activeUsers: Record<string, any>;
  isMakingPick: boolean;
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
  const [draftedStockIds, setDraftedStockIds] = useState<Set<number>>(new Set());

  const [currentPortfolioId, setCurrentPortfolioId] = useState<number | null>(null);
  const [currentPick, setCurrentPick] = useState(0);
  const [round, setRound] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [timerStartTime, setTimerStartTime] = useState<string | null>(null);
  const [secondsPerPick, setSecondsPerPick] = useState(60);
  const [timer, setTimer] = useState(60);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftEnded, setDraftEnded] = useState(false);
  const [draftRounds, setDraftRounds] = useState(0);
  const [isMakingPick, setIsMakingPick] = useState(false);

  const intervalRef = useRef<number | null>(null);

  const activePortfolio = users.find(u => u.portfolio_id === currentPortfolioId);
  const [myPortfolio, setMyPortfolio] = useState<Portfolio | undefined>();
  const [league, setLeague] = useState<LeagueRow | null>(null);

  const isOwner = !!league && !!myPortfolio && league.owner_id === myPortfolio.user_id;

  const [queuedItems, setQueuedItems] = useState<WishlistItem[]>([]);
  const [queuedLoaded, setQueuedLoaded] = useState(false);

  const [stockPrices, setStockPrices] = useState<Record<number, number>>({});
  const [activeUsers, setActiveUsers] = useState<Record<string, any>>({});

  useEffect(() => {
    const ids = new Set<number>();
    draftPicks.forEach(p => ids.add(p.stock_id));
    setDraftedStockIds(ids);
  }, [draftPicks]);

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

  useEffect(() => {
    const channel = supabase
      .channel(`drafts-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Drafts", filter: `league_id=eq.${leagueId}` },
        async (payload) => {
          hydrateFromDraftRow(payload.new);
          await refreshDraftPicks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  useEffect(() => {
    let channel: any;
    let isMounted = true;

    const setupPresence = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || !isMounted) return;

        channel = supabase.channel(`draft-room-${leagueId}`, {
          config: {
            presence: {
              key: user.id,
            },
          },
        });

        channel.on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as Record<string, any[]>;
          setActiveUsers({ ...state });
        });

        await channel.subscribe();

        await channel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Presence setup failed:", err);
      }
    };

    setupPresence();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [leagueId]);

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

  useEffect(() => {
    if (!myPortfolio?.portfolio_id) return;

    const refreshQueue = async () => {
      setQueuedLoaded(false);
      const updated = await getWishlistByPortfolio(myPortfolio.portfolio_id);
      setQueuedItems(updated ?? []);
      setQueuedLoaded(true);
    };

    refreshQueue();
  }, [myPortfolio?.portfolio_id, currentPortfolioId, round]);

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

    const seconds = d.seconds_per_pick ?? 60;
    setSecondsPerPick(seconds);
    setTimer(seconds);
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

  useEffect(() => {
    if (!timerStartTime) {
      setTimer(secondsPerPick);
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    const update = () => {
      const start = Date.parse(timerStartTime);
      const now = Date.now();
      const elapsed = Math.max(Math.floor((now - start) / 1000), 0);
      setTimer(Math.max(secondsPerPick - elapsed, 0));
    };

    update();
    intervalRef.current = window.setInterval(update, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerStartTime, secondsPerPick]);

  const startDraft = async () => {
    await fetch(`${SERVER_URL}/draft/${leagueId}/start`, { method: "POST" });
  };

  const queueStock = async (stockId: number) => {
    if (!myPortfolio) return;

    // Prevent duplicate queue
    if (queuedItems.some((i) => i.stock_id === stockId)) return;

    // --- optimistic item ---
    const tempItem = {
      wishlist_item_id: -Date.now(), // temporary id
      portfolio_id: myPortfolio.portfolio_id,
      stock_id: stockId,
      rank: queuedItems.length,
    };

    // Instant UI update
    setQueuedItems((prev) => [...prev, tempItem]);

    try {
      const inserted = await addWishlistItem({
        portfolio_id: myPortfolio.portfolio_id,
        stock_id: stockId,
      });

      // Replace temp item with real DB item
      setQueuedItems((prev) =>
        prev.map((item) =>
          item.wishlist_item_id === tempItem.wishlist_item_id
            ? inserted
            : item
        )
      );
    } catch (err) {
      console.error("Queue failed:", err);

      // Rollback UI
      setQueuedItems((prev) =>
        prev.filter((i) => i.wishlist_item_id !== tempItem.wishlist_item_id)
      );
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

  // const makePick = async (stockId: number) => {
  //   if (!currentPortfolioId) return;

  //   await fetch(`${SERVER_URL}/draft/${leagueId}/pick`, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({
  //       portfolioId: currentPortfolioId,
  //       stockId,
  //       round,
  //       pickNumber: draftPicks.length + 1,
  //     }),
  //   });
  // };
  const makePick = async (stockId: number) => {
    if (!currentPortfolioId) return;
    if (isMakingPick) return;

    setIsMakingPick(true);

    const tempPick = {
      draft_id: leagueId,
      portfolio_id: currentPortfolioId,
      stock_id: stockId,
      round_number: round,
      pick_number: draftPicks.length + 1,
      temp: true,
    };

    // --- optimistic draft picks ---
    setDraftPicks(prev => [...prev, tempPick]);

    // --- optimistic drafted ids ---
    setDraftedStockIds(prev => {
      const copy = new Set(prev);
      copy.add(stockId);
      return copy;
    });

    // --- optimistic queue removal (my queue only) ---
    if (myPortfolio?.portfolio_id === currentPortfolioId) {
      setQueuedItems(prev =>
        prev.filter(item => item.stock_id !== stockId)
      );
    }

    try {
      await fetch(`${SERVER_URL}/draft/${leagueId}/pick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          portfolioId: currentPortfolioId,
          stockId,
          round,
          pickNumber: draftPicks.length + 1,
        }),
      });

      // realtime will correct state shortly
    } catch (err) {
      console.error("Pick failed:", err);

      // --- rollback ---
      setDraftPicks(prev =>
        prev.filter(p => p !== tempPick)
      );

      setDraftedStockIds(prev => {
        const copy = new Set(prev);
        copy.delete(stockId);
        return copy;
      });
    }

    setIsMakingPick(false);
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
        queuedLoaded,
        draftPicks,
        draftedStockIds,
        stockPrices,
        activeUsers,
        isMakingPick,
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