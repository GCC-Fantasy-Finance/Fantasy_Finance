import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getPortfoliosByLeague } from "../lib/portfolios";
import { getDraftByLeague, type Portfolio } from "../lib/drafts";
import { addWishlistItem, getWishlistByPortfolio, type WishlistItem } from "../lib/wishlists";
import { getLeagueById, type LeagueRow } from "../lib/leagues";

const SERVER_URL = import.meta.env.VITE_DRAFT_SERVER_URL || "http://localhost:4000";

type DraftContextType = {
  users: Portfolio[];
  leagueId: number;
  name: string | null;
  currentPick: number; // UI index only
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
};

const DraftContext = createContext<DraftContextType | undefined>(undefined);

export const DraftProvider = ({ leagueId, children }: { leagueId: number; children: ReactNode }) => {
  const [users, setUsers] = useState<Portfolio[]>([]);
  const usersRef = useRef<Portfolio[]>([]);
  const [draftPicks, setDraftPicks] = useState<any[]>([]);

  // 🔥 DB source of truth
  const [currentPortfolioId, setCurrentPortfolioId] = useState<number | null>(null);

  // UI derived state
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

  // Initial load
  useEffect(() => {
    const load = async () => {
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
    };

    load();
  }, [leagueId]);

  // Draft realtime
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

  // Picks realtime
  useEffect(() => {
    const channel = supabase
      .channel(`draftpicks-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Draft Picks", filter: `draft_id=eq.${leagueId}` },
        () => {
          supabase
            .from("Draft Picks")
            .select("*")
            .eq("draft_id", leagueId)
            .order("pick_number")
            .then(({ data }) => setDraftPicks(data ?? []));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  // Resolve my portfolio
  useEffect(() => {
    const resolveMyPortfolio = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const mine = usersRef.current.find((p) => p.user_id === user.id);
      setMyPortfolio(mine);
    };

    if (usersRef.current.length) resolveMyPortfolio();
  }, [users]);

  // Load queue
  useEffect(() => {
    if (!myPortfolio?.portfolio_id) return;
    getWishlistByPortfolio(myPortfolio.portfolio_id).then(data => setQueuedItems(data ?? []));
  }, [myPortfolio?.portfolio_id]);

  // Hydrate from draft row (DB → state)
  const hydrateFromDraftRow = (d: any) => {
    setDraftStarted(d.is_started);
    setDraftEnded(d.is_ended);
    setDraftRounds(d.total_rounds);
    setRound(d.current_round);
    setDirection(d.is_snaking_forward ? "forward" : "backward");
    setTimerStartTime(d.timer_start_time ?? null);
    setCurrentPortfolioId(d.current_portfolio_id);
  };

  // 🔥 Derive UI index from users + DB ID
  useEffect(() => {
    if (currentPortfolioId == null) return;
    if (users.length === 0) return;

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
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerStartTime]);

  const startDraft = async () => {
    if (usersRef.current.length === 0) return;

    // First drafter in order
    const firstPortfolioId = usersRef.current[0].portfolio_id;

    const { error } = await supabase
      .from("Drafts")
      .update({
        is_started: true,
        timer_start_time: new Date().toISOString(),
        current_portfolio_id: firstPortfolioId, // 🔥 THIS WAS MISSING
        current_round: 1,
        is_snaking_forward: true,
      })
      .eq("league_id", leagueId);

    if (error) {
      console.error("Failed to start draft:", error);
    }
  };


  const queueStock = async (stockId: number) => {
    if (!myPortfolio?.portfolio_id) return;
    if (queuedItems.some((i) => i.stock_id === stockId)) return;

    const optimisticItem: WishlistItem = { portfolio_id: myPortfolio.portfolio_id, stock_id: stockId };
    setQueuedItems((prev) => [...prev, optimisticItem]);

    try {
      await addWishlistItem({ portfolio_id: myPortfolio.portfolio_id, stock_id: stockId });
    } catch {
      setQueuedItems((prev) => prev.filter((i) => i.stock_id !== stockId));
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
        startDraft,
        makePick,
        queueStock,
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