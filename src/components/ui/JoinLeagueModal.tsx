import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Button } from "./button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
};

function getFriendlyJoinError(err: any): string {
  const raw = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "");

  if (
    code === "42501" ||
    raw.includes("row-level security") ||
    raw.includes("violates row-level security")
  ) {
    return "This league is full.";
  }

  if (raw.includes("kicked")) {
    return "You have been kicked from this league.";
  }

  if (raw.includes("duplicate") || raw.includes("already")) {
    return "You are already in this league.";
  }

  return "Unable to join league. Please try again.";
}

export default function JoinLeagueModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const [joinCode, setJoinCode] = useState<string>("");

  // --- ESC key + auto-focus handling ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    if (open) {
      document.addEventListener("keydown", onKey);
      setTimeout(() => nameRef.current?.focus(), 0);
    }

    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // --- RESET MODAL WHEN CLOSED ---
  useEffect(() => {
    if (!open) {
      setJoinCode("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!joinCode) {
      setError("Please enter a Join Code");
      return;
    }

    if (!user) {
      setError("You must be signed in to join a league.");
      return;
    }

    setLoading(true);

    try {
      const { data: leagueData, error: leagueError } = await supabase
        .from("Leagues")
        .select("league_id,kicked_users")
        .eq("join_code", joinCode)
        .single();

      if (leagueError) {
        setError("Invalid or expired join code.");
        setLoading(false);
        return;
      }

      const kickedUsers = (leagueData?.kicked_users ?? []) as string[];
      if (kickedUsers.includes(user.id)) {
        const kickedMsg = "You have been kicked from this league.";
        setError(kickedMsg);
        toast.error(kickedMsg);
        setLoading(false);
        return;
      }

      console.log("League data found:", leagueData);

      const portfolioPayload = {
        league_id: leagueData?.league_id,
        user_id: user.id,
        previous_close_value: 10000,
        reserve_value: 10000,
        last_recalculated: new Date().toISOString(),
        is_solo: false,
      };

      const { data: existingPortfolio, error: portfolioError } = await supabase
        .from("Portfolios")
        .select("portfolio_id")
        .eq("league_id", leagueData?.league_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingPortfolio) {
        setError("You are already in this league.");
        setLoading(false);
        return;
      }
      if (portfolioError) throw portfolioError;

      const { data: portfolioData, error: supaError } = await supabase
        .from("Portfolios")
        .insert([portfolioPayload])
        .select()
        .single();

      if (supaError) {
        const friendly = getFriendlyJoinError(supaError);
        setError(friendly);
        toast.error(friendly);
        return;
      };

      const { error: historyError } = await supabase
        .from("Portfolio Histories")
        .insert([
          {
            portfolio_id: portfolioData?.portfolio_id,
            value: 10000,
          },
        ]);
      if (historyError) throw historyError;

      window.dispatchEvent(
        new CustomEvent("ff:leagues-updated", { detail: { leagueId: leagueData?.league_id } })
      );
      toast.success("Successfully joined league!");
      onClose();
    } catch (err: any) {
      console.error("Error joining league:", err);
      const msg = err?.message || "Failed to join league";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const modal = (
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold mb-3">Join League</h2>

        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
          
            <input
              ref={nameRef}
              name="joinCode"
              value={joinCode}
              placeholder="Join Code"
              onFocus={() => {
                if (error) setError(null);
              }}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              className={`w-full rounded border px-3 py-2 text-sm mb-3 uppercase ${
                error ? "border-2 border-red-500" : ""
              }`}
            />
          </div>

          <div className="flex justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Joining..." : "Join"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
