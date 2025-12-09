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

// --- Helper functions for default times ---
function defaultStart() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function defaultEnd() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function CreateLeagueModal({ open, onClose }: Props) {
  const nameRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();

  // --- State ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState<string>("");
  const [startAt, setStartAt] = useState<string>(defaultStart);
  const [endAt, setEndAt] = useState<string>(defaultEnd);
  const [hasTrading, setHasTrading] = useState<boolean>(true);
  const [hasDraft, setHasDraft] = useState<boolean>(true);
  const [draftRounds, setDraftRounds] = useState<number | "">(3);
  const [sectorsInput, setSectorsInput] = useState<string>("");

  // --- Focus + ESC close ---
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
      setLeagueName("");
      setStartAt(defaultStart());
      setEndAt(defaultEnd());
      setHasTrading(true);
      setHasDraft(true);
      setDraftRounds(3);
      setSectorsInput("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  // --- Submit Handler ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = (nameRef.current?.value?.trim() || leagueName).trim();

    if (!name) {
      setError("Please enter a league name.");
      return;
    }

    if (!user) {
      setError("You must be signed in to create a league.");
      return;
    }

    if (hasDraft) {
      const rounds = Number(draftRounds);
      if (!rounds || rounds < 1) {
        setError("Please enter a valid number of draft rounds.");
        return;
      }
    }

    if (startAt && endAt) {
      const s = new Date(startAt);
      const eDate = new Date(endAt);
      if (s > eDate) {
        setError("Start time must be before end time.");
        return;
      }
    }

    setLoading(true);

    try {
      const payload: any = {
        name,
        owner_id: user.id,
        start_time: startAt ? new Date(startAt).toISOString() : null,
        finish_time: endAt ? new Date(endAt).toISOString() : null,
        has_trading: hasTrading,
        has_drafting: hasDraft,
        sectors: sectorsInput
          ? sectorsInput.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        created_at: new Date().toISOString(),
      };

      const { data, error: supaError } = await supabase
        .from("Leagues")
        .insert([payload])
        .select()
        .single();

      if (supaError) throw supaError;

      const leagueId = data?.league_id || data?.id;

      if (leagueId) {
        const portfolioPayload = {
          league_id: leagueId,
          user_id: user.id,
          total_value: 10000,
          reserve_value: 10000,
          last_recalculated: new Date().toISOString(),
          is_solo: false,
        };

        const { data: portfolioData } = await supabase
          .from("Portfolios")
          .insert([portfolioPayload])
          .select()
          .single();

        const portfolioId = portfolioData?.portfolio_id;

        const draftPayload = {
          league_id: leagueId,
          total_rounds:
            typeof draftRounds === "number" ? draftRounds : null,
          current_round: 0,
          current_pick: 0,
          current_portfolio_id: portfolioId,
          is_snaking_forward: true,
          timer_start_time: null,
          is_started: false,
          is_ended: false,
        };

        await supabase.from("Drafts").insert([draftPayload]);

        onClose(); // modal resets automatically because of the effect above
      } else {
        setError("League creation did not return an id.");
      }
    } catch (err: any) {
      console.error("Error creating league:", err);
      const msg = err?.message || "Failed to create league";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // --- Modal ---
  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold mb-3">Create League</h2>

        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">League Name</label>
            <input
              ref={nameRef}
              name="leagueName"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm mb-3"
            />

            <label className="block text-sm font-medium mb-1">Start Date & Time</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm mb-3"
            />

            <label className="block text-sm font-medium mb-1">End Date & Time</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm mb-3"
            />
          </div>

          <div className="mb-3 flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasTrading}
                onChange={(e) => setHasTrading(e.target.checked)}
              />
              Has trading
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasDraft}
                onChange={(e) => setHasDraft(e.target.checked)}
              />
              Has drafting
            </label>
          </div>

          {hasDraft && (
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Draft Rounds</label>
              <input
                type="number"
                min={1}
                value={draftRounds as number}
                onChange={(e) =>
                  setDraftRounds(Number(e.target.value) || "")
                }
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Sectors (comma-separated)
            </label>
            <input
              type="text"
              value={sectorsInput}
              onChange={(e) => setSectorsInput(e.target.value)}
              placeholder="Tech, Finance, Healthcare"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
