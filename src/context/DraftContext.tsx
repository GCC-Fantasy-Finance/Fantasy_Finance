import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getPortfoliosByLeague } from "../lib/portfolios";

type Portfolio = { portfolio_id: string; user_id: string; reserve_value: number };

const DRAFT_ROUNDS = 3; // TODO: get from db

type DraftContextType = {
  users: Portfolio[];
  currentPick: number;
  round: number;
  direction: "forward" | "backward";
  timer: number;
  draftStarted: boolean;
  startDraft: () => void;
  advancePick: () => void;
  resetTimer: () => void;
  currentUser: Portfolio | undefined;
  draftEnded: boolean;
};

const DraftContext = createContext<DraftContextType | undefined>(undefined);

export const DraftProvider = ({ children }: { children: ReactNode }) => {
  const [users, setUsers] = useState<Portfolio[]>([]);
  const [currentPick, setCurrentPick] = useState(0);
  const [round, setRound] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [timer, setTimer] = useState(60);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftEnded, setDraftEnded] = useState(false);

  // Fetch portfolios from the database on mount
  useEffect(() => {
    getPortfoliosByLeague(6).then((data) => {
      setUsers(data ?? []);
      console.log(data);
    });
  }, []);

  useEffect(() => {
    if (!draftStarted || draftEnded) return;
    if (round > DRAFT_ROUNDS) {
      setDraftEnded(true);
      return;
    }
    if (timer === 0) {
      advancePick();
      return;
    }
    const interval = setInterval(() => {
      setTimer((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [timer, draftStarted, round, draftEnded]);

  const startDraft = () => {
    setDraftStarted(true);
    setDraftEnded(false);
    setCurrentPick(0);
    setRound(1);
    setDirection("forward");
    setTimer(60);
  };

  const advancePick = () => {
    // Check if this is the last pick of the draft
    const isLastRound = round === DRAFT_ROUNDS;
    const isLastPickForward = direction === "forward" && currentPick === users.length - 1;
    const isLastPickBackward = direction === "backward" && currentPick === 0;

    if (isLastRound && (isLastPickForward || isLastPickBackward)) {
      setDraftEnded(true);
      setTimer(0);
      return;
    }

    let nextPick = direction === "forward" ? currentPick + 1 : currentPick - 1;
    let nextRound = round;
    let nextDirection = direction;

    if (nextPick >= users.length) {
      nextPick = users.length - 1;
      nextDirection = "backward";
      nextRound += 1;
    } else if (nextPick < 0) {
      nextPick = 0;
      nextDirection = "forward";
      nextRound += 1;
    }

    setCurrentPick(nextPick);
    setRound(nextRound);
    setDirection(nextDirection);
    setTimer(60);
  };

  const resetTimer = () => setTimer(60);

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
        startDraft,
        advancePick,
        resetTimer,
        currentUser,
        draftEnded,
      }}
    >
      {children}
    </DraftContext.Provider>
  );
};

export const useDraft = () => {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within a DraftProvider");
  return ctx;
};