import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPortfoliosByLeague } from "../lib/portfolios";
import { supabase } from "@/lib/supabase";

type Portfolio = {
  portfolio_id: string;
  user_id: string;
  reserve_value: number;
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

export const DraftProvider = ({ children }: { children: ReactNode }) => {
  const leagueId = 6;
  const PICK_SECONDS = 60;

  const [users, setUsers] = useState<Portfolio[]>([]);
  const usersRef = useRef<Portfolio[]>([]);

  const [currentPick, setCurrentPick] = useState(0);
  const [round, setRound] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">(
    "forward"
  );
  const [timer, setTimer] = useState(PICK_SECONDS);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftEnded, setDraftEnded] = useState(false);
  const [draftRounds, setDraftRounds] = useState(0);

  /* ================================
     Keep users ref in sync
     ================================ */
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  /* ================================
     Initial load
     ================================ */
  useEffect(() => {
    const load = async () => {
      const userData = await getPortfoliosByLeague(leagueId);
      setUsers(userData ?? []);
      usersRef.current = userData ?? [];

      const { data, error } = await supabase
        .from("Drafts")
        .select("*")
        .eq("league_id", leagueId)
        .single();

      if (error || !data) {
        console.error("Failed to load draft:", error);
        return;
      }

      hydrateFromDraftRow(data);
    };

    load();
  }, []);

  /* ================================
     Realtime sync (authoritative)
     ================================ */
  useEffect(() => {
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
        (payload) => {
          hydrateFromDraftRow(payload.new, payload.commit_timestamp);
        }
      )
      .subscribe((status) => console.log("Draft realtime status:", status));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ================================
     Local UI countdown + auto advance
     ================================ */
  useEffect(() => {
    if (!draftStarted || draftEnded) return;

    const interval = setInterval(async () => {
      setTimer((t) => {
        if (t <= 1) {
          // Timer reached 0: advance pick
          advancePick().catch(console.error);
          return PICK_SECONDS;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [draftStarted, draftEnded, currentPick, round, direction]);

  /* ================================
     Helpers
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
    const users = usersRef.current;
    if (!users.length) return;

    const { error } = await supabase
      .from("Drafts")
      .update({
        is_started: true,
        is_ended: false,
        current_round: 1,
        current_pick: 0,
        is_snaking_forward: true,
        current_portfolio_id: users[0].portfolio_id,
        timer_start_time: new Date().toISOString(),
      })
      .eq("league_id", leagueId);

    if (error) console.error("startDraft failed:", error);
  };

  const advancePick = async () => {
    const users = usersRef.current;
    if (!users.length) return;

    let nextPick = currentPick;
    let nextRound = round;
    let nextDirection = direction;

    if (direction === "forward") {
      nextPick++;
      if (nextPick >= users.length) {
        nextPick = users.length - 1;
        nextDirection = "backward";
        nextRound++;
      }
    } else {
      nextPick--;
      if (nextPick < 0) {
        nextPick = 0;
        nextDirection = "forward";
        nextRound++;
      }
    }

    if (nextRound > draftRounds) {
      await supabase
        .from("Drafts")
        .update({
          is_ended: true,
          current_round: nextRound,
          current_pick: nextPick,
          current_portfolio_id: null,
        })
        .eq("league_id", leagueId);
      return;
    }

    const { error } = await supabase
      .from("Drafts")
      .update({
        current_round: nextRound,
        current_pick: nextPick,
        current_portfolio_id: users[nextPick].portfolio_id,
        is_snaking_forward: nextDirection === "forward",
        timer_start_time: new Date().toISOString(),
      })
      .eq("league_id", leagueId);

    if (error) console.error("advancePick failed:", error);
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