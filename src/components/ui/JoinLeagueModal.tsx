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

export default function JoinLeagueModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const [leagueId, setLeagueId] = useState<string>("");

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
      setLeagueId("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!leagueId) {
      setError("Please enter a League Id");
      return;
    }

    if (!user) {
      setError("You must be signed in to join a league.");
      return;
    }

    setLoading(true);

    try {
      const portfolioPayload = {
        league_id: leagueId,
        user_id: user.id,
        total_value: 10000,
        reserve_value: 10000,
        last_recalculated: new Date().toISOString(),
        is_solo: false,
      };

      const { error: supaError } = await supabase
        .from("Portfolios")
        .insert([portfolioPayload])
        .select()
        .single();

      if (supaError) throw supaError;

      onClose(); // reset will trigger from useEffect
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold mb-3">Join League</h2>

        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">League Id</label>
            <input
              ref={nameRef}
              name="leagueId"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm mb-3"
            />
          </div>

          <div className="flex justify-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
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
