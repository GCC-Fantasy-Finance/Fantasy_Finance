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
      const { data: portfolioId, error } = await supabase.rpc("join_league", {
        p_join_code: joinCode,
      });

      if (error) {
        const msg = error.message || "Failed to join league";
        setError(msg);
        toast.error(msg);
        return;
      }

      // ✅ Use returned portfolio ID
      toast.success("Joined league successfully!");
      // Example: redirect instead of reload
      window.location.href = `/portfolio/${portfolioId}`;

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
