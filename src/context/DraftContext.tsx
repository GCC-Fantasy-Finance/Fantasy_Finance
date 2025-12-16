import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getPortfoliosByLeague } from "../lib/portfolios";
import { getDraftByLeague, startDraft as startDraftApi, advanceDraft } from "../lib/drafts";
import { supabase } from "@/lib/supabase";

type Portfolio = {
  portfolio_id: string;
  user_id: string;
  reserve_value: number;
  Profiles?: {
    username: string;
  };
};

type DraftContextType = {
  users: Portfolio[];
  currentPick: number;
  round: number;
  direction: "forward" | "backward";
  timer: number;
  draftStarted: boolean;
  draftEnded: boolean;
  draftRounds: number;
  currentUser: Portfolio | undefined;
  startDraft: () => Promise<void>;
  advancePick: () => Promise<void>;
  resetTimer: () => void;
};

const DraftContext = createContext<DraftContextType | undefined>(undefined);

export const DraftProvider = ({ leagueId, children }: { leagueId: number; children: ReactNode }) => {
  if (!Number.isFinite(leagueId)) throw new Error("DraftProvider requires a valid leagueId");

  const PICK_SECONDS = 60;

  const [users, setUsers] = useState<Portfolio[]>([]);
  const usersRef = useRef<Portfolio[]>([]);

  const [currentPick, setCurrentPick] = useState(0);
  const [round, setRound] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [timer, setTimer] = useState(PICK_SECONDS);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftEnded, setDraftEnded] = useState(false);
  const [draftRounds, setDraftRounds] = useState(0);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const userData = await getPortfoliosByLeague(leagueId);
      setUsers(userData ?? []);
      usersRef.current = userData ?? [];

      const draftData = await getDraftByLeague(leagueId);
      if (draftData) hydrateFromDraftRow(draftData);
    };
    load();
  }, [leagueId]);

  // Realtime updates
  useEffect(() => {
    if (!leagueId) return;

    const channel = supabase
      .channel("draft-sync")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Drafts",
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => hydrateFromDraftRow(payload.new, payload.commit_timestamp)
      )
      .subscribe((status) => {
        console.log("Draft realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);



  // Countdown timer
  useEffect(() => {
    if (!draftStarted || draftEnded) return;

    const interval = setInterval(async () => {
      setTimer((t) => {
        if (t <= 1) {
          advancePick().catch(console.error);
          return PICK_SECONDS;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [draftStarted, draftEnded, currentPick, round, direction]);

  const hydrateFromDraftRow = (d: any, commitTs?: string) => {
    setDraftStarted(d.is_started);
    setDraftEnded(d.is_ended);
    setDraftRounds(d.total_rounds);
    setRound(d.current_round);
    setDirection(d.is_snaking_forward ? "forward" : "backward");

    const idx = usersRef.current.findIndex((u) => u.portfolio_id === d.current_portfolio_id);
    setCurrentPick(idx >= 0 ? idx : 0);

    if (d.timer_start_time) {
      const serverNow = Date.parse(commitTs ?? new Date().toISOString());
      const start = Date.parse(d.timer_start_time);
      const elapsed = Math.max(Math.round((serverNow - start) / 1000), 0);
      setTimer(Math.max(PICK_SECONDS - elapsed, 0));
    }
  };

  // Actions
  const startDraft = async () => {
    const users = usersRef.current;
    if (!users.length) return;
    await startDraftApi(leagueId, users[0].portfolio_id);
  };

  const advancePick = async () => {
    const result = await advanceDraft(leagueId, usersRef.current, currentPick, round, direction, draftRounds);
    setCurrentPick(result.nextPick);
    setRound(result.nextRound);
    setDirection(result.nextDirection);
    setDraftEnded(result.isDraftEnded);
    if (!result.isDraftEnded) setTimer(PICK_SECONDS);
  };

  const resetTimer = () => setTimer(PICK_SECONDS);

  const currentUser = users[currentPick];

  return (
    <DraftContext.Provider
      value={{
        users,
        currentPick,
        round,
        direction,
        timer,
        draftStarted,
        draftEnded,
        draftRounds,
        currentUser,
        startDraft,
        advancePick,
        resetTimer,
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