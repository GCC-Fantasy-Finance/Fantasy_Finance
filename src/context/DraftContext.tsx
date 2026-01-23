import { createContext, useContext, useEffect, useRef, useState, type ReactNode, } from "react";
import { supabase } from "@/lib/supabase";
import { getPortfoliosByLeague } from "../lib/portfolios";
import { getDraftByLeague, startDraft as startDraftApi, advanceDraft, type Portfolio, } from "../lib/drafts";
import { insertDraftPick } from "../lib/draftpicks";
import { addWishlistItem, getWishlistByPortfolio, type WishlistItem, } from "../lib/wishlists";
import { getLeagueById, type LeagueRow } from "../lib/leagues";

/* ================================
   Types
================================ */
type DraftContextType = {
  users: Portfolio[];
  leagueId: number;

  // League
  name: string | null;

  // Draft state
  currentPick: number;
  round: number;
  direction: "forward" | "backward";
  timer: number;
  draftStarted: boolean;
  draftEnded: boolean;
  draftRounds: number;

  // Identity
  activePortfolio: Portfolio | undefined;
  myPortfolio: Portfolio | undefined;
  isOwner: boolean;

  // Queue
  queuedItems: WishlistItem[];

  // Actions
  startDraft: () => Promise<void>;
  makePick: (stockId: number) => Promise<void>;
  queueStock: (stockId: number) => Promise<void>;
};

const DraftContext = createContext<DraftContextType | undefined>(undefined);

/* ================================
   Provider
================================ */
export const DraftProvider = ({
  leagueId,
  children,
}: {
  leagueId: number;
  children: ReactNode;
}) => {
  if (!Number.isFinite(leagueId)) {
    throw new Error("DraftProvider requires a valid leagueId");
  }

  const PICK_SECONDS = 10;

  const [users, setUsers] = useState<Portfolio[]>([]);
  const usersRef = useRef<Portfolio[]>([]);

  // Draft state
  const [currentPick, setCurrentPick] = useState(0);
  const [round, setRound] = useState(1);
  const [direction, setDirection] =
    useState<"forward" | "backward">("forward");
  const [timer, setTimer] = useState(PICK_SECONDS);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftEnded, setDraftEnded] = useState(false);
  const [draftRounds, setDraftRounds] = useState(0);

  // Identity
  const activePortfolio = users[currentPick];
  const [myPortfolio, setMyPortfolio] = useState<Portfolio | undefined>();
  const [league, setLeague] = useState<LeagueRow | null>(null);

  const isOwner =
    !!league &&
    !!myPortfolio &&
    league.owner_id === myPortfolio.user_id;

  // Queue (only for this user)
  const [queuedItems, setQueuedItems] = useState<WishlistItem[]>([]);

  /* ================================
     Load league + draft + users
  ================================ */
  useEffect(() => {
    const load = async () => {
      const [userData, draftData, leagueData] = await Promise.all([
        getPortfoliosByLeague(leagueId),
        getDraftByLeague(leagueId),
        getLeagueById(leagueId),
      ]);

      setUsers(userData ?? []);
      usersRef.current = userData ?? [];

      if (draftData) hydrateFromDraftRow(draftData);
      if (leagueData) setLeague(leagueData);
    };

    load();
  }, [leagueId]);

  /* ================================
     Resolve my portfolio
  ================================ */
  useEffect(() => {
    const resolveMyPortfolio = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const mine = usersRef.current.find((p) => p.user_id === user.id);
      setMyPortfolio(mine);
    };

    if (usersRef.current.length) resolveMyPortfolio();
  }, [users]);

  /* ================================
     Load my queue
  ================================ */
  useEffect(() => {
    if (!myPortfolio?.portfolio_id) return;

    const loadQueue = async () => {
      const data = await getWishlistByPortfolio(myPortfolio.portfolio_id);
      setQueuedItems(data ?? []);
    };

    loadQueue();
  }, [myPortfolio?.portfolio_id]);

  /* ================================
     Realtime draft sync
  ================================ */
  useEffect(() => {
    if (!leagueId) return;

    const channel = supabase
      .channel(`draft-sync-${leagueId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Drafts",
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => {
          hydrateFromDraftRow(payload.new, payload.commit_timestamp);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  /* ================================
     Draft timer
  ================================ */
  useEffect(() => {
    if (!draftStarted || draftEnded) return;
    if (timer <= 0) return;

    const interval = setInterval(() => {
      setTimer((t) => Math.max(t - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [draftStarted, draftEnded, timer]);

  /* ================================
     Hydrate from draft row
  ================================ */
  const hydrateFromDraftRow = (d: any, commitTs?: string) => {
    setDraftStarted(d.is_started);
    setDraftEnded(d.is_ended);
    setDraftRounds(d.total_rounds);
    setRound(d.current_round);
    setDirection(d.is_snaking_forward ? "forward" : "backward");

    const idx = usersRef.current.findIndex(
      (u) => u.portfolio_id === d.current_portfolio_id
    );
    setCurrentPick(idx >= 0 ? idx : 0);

    if (d.timer_start_time) {
      const serverNow = Date.parse(commitTs ?? new Date().toISOString());
      const start = Date.parse(d.timer_start_time);
      const elapsed = Math.max(Math.round((serverNow - start) / 1000), 0);
      setTimer(Math.max(PICK_SECONDS - elapsed, 0));
    }
  };

  /* ================================
     Actions
  ================================ */
  const startDraft = async () => {
    if (!isOwner) {
      console.warn("Only league owner can start draft");
      return;
    }

    const users = usersRef.current;
    if (!users.length) return;

    await startDraftApi(leagueId, users[0].portfolio_id);
  };

  const queueStock = async (stockId: number) => {
    if (!myPortfolio?.portfolio_id) return;
    if (queuedItems.some((i) => i.stock_id === stockId)) return;

    const optimisticItem: WishlistItem = {
      portfolio_id: myPortfolio.portfolio_id,
      stock_id: stockId,
    };

    setQueuedItems((prev) => [...prev, optimisticItem]);

    try {
      await addWishlistItem({
        portfolio_id: myPortfolio.portfolio_id,
        stock_id: stockId,
      });
    } catch (err) {
      console.error("Failed to queue stock:", err);
      setQueuedItems((prev) => prev.filter((i) => i.stock_id !== stockId));
    }
  };

  const makePick = async (stockId: number) => {
    const currentPortfolio = usersRef.current[currentPick];
    if (!currentPortfolio) return;

    await insertDraftPick(
      leagueId,
      currentPortfolio.portfolio_id,
      2,
      stockId,
      round,
      currentPick
    );

    const result = await advanceDraft(
      leagueId,
      usersRef.current,
      currentPick,
      round,
      direction,
      draftRounds
    );

    setCurrentPick(result.nextPick);
    setRound(result.nextRound);
    setDirection(result.nextDirection);
    setDraftEnded(result.isDraftEnded);

    if (!result.isDraftEnded) setTimer(PICK_SECONDS);
  };

  /* ================================
     Provider
  ================================ */
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
        startDraft,
        makePick,
        queueStock,
      }}
    >
      {children}
    </DraftContext.Provider>
  );
};

/* ================================
   Hook
================================ */
export const useDraft = () => {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within DraftProvider");
  return ctx;
};