import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Button } from "./button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";

const AVAILABLE_SECTORS = [
  "Technology",
  "Finance",
  "Healthcare",
  "Energy",
  "Industrials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
];

type Props = {
  open: boolean;
  onClose: () => void;
};

function defaultStart() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultEnd() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateLeagueModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [leagueName, setLeagueName] = useState("");
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [hasTrading, setHasTrading] = useState(true);
  const [hasDraft, setHasDraft] = useState(true);
  const [draftRounds, setDraftRounds] = useState<number | "">(3);
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    new Set()
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  // Focus + ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDropdown) setShowDropdown(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => nameRef.current?.focus(), 0);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, showDropdown]);

  // Click handling
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!modalRef.current) return;

      if (showDropdown) {
        // Dropdown is open → click outside dropdown closes it
        if (dropdownRef.current && !dropdownRef.current.contains(target)) {
          setShowDropdown(false);
        }
        // Always prevent modal closing while dropdown is open
        return;
      }

      // Dropdown closed → click outside modal closes modal
      if (!modalRef.current.contains(target)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, showDropdown]);

  // Reset modal when closed
  useEffect(() => {
    if (!open) {
      setLeagueName("");
      setStartAt(defaultStart());
      setEndAt(defaultEnd());
      setHasTrading(true);
      setHasDraft(true);
      setDraftRounds(3);
      setSelectedSectors(new Set());
      setShowDropdown(false);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!leagueName.trim()) return setError("League name required.");
    if (!user) return setError("You must be signed in.");
    if (hasDraft && (!draftRounds || Number(draftRounds) < 1)) {
      return setError("Invalid draft rounds.");
    }
    if (new Date(startAt) > new Date(endAt)) {
      return setError("Start must be before end.");
    }

    setLoading(true);

    try {

      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 9; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setJoinCode(code);

      const { data, error } = await supabase
        .from("Leagues")
        .insert([
          {
            name: leagueName.trim(),
            owner_id: user.id,
            start_time: new Date(startAt).toISOString(),
            finish_time: new Date(endAt).toISOString(),
            has_trading: hasTrading,
            has_drafting: hasDraft,
            sectors:
              selectedSectors.size > 0
                ? Array.from(selectedSectors)
                : ["Any"],
            join_code: code,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      await supabase.from("Portfolios").insert([
        {
          league_id: data.league_id,
          user_id: user.id,
          previous_close_value: 10000,
          reserve_value: 10000,
          is_solo: false,
          last_recalculated: new Date().toISOString(),
        },
      ]);

      if (hasDraft){
        await supabase.from("Drafts").insert([
          {
            league_id: data.league_id,
            current_round: 0,
            current_pick: 0,
            current_portfolio_id: null,
            is_snaking_forward: true,
            timer_start_time: data.start_time,
            is_started: false,
            is_ended: false,
            total_rounds: draftRounds
            
          },
        ]);
      }

      toast.success("League created");
      window.location.reload();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create league");
      toast.error(err.message || "Failed to create league");
    } finally {
      setLoading(false);
    }

    



  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold mb-4">Create League</h2>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={nameRef}
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            placeholder="League name"
            className="w-full rounded border px-3 py-2 text-sm"
          />

          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />

          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasTrading}
                onChange={(e) => setHasTrading(e.target.checked)}
              />
              Trading
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasDraft}
                onChange={(e) => setHasDraft(e.target.checked)}
              />
              Drafting
            </label>
          </div>

          <label className="text-sm">Number of Draft Rounds</label>
          {hasDraft && (
            
            <input
              type="number"
              min={1}
              value={draftRounds}
              onChange={(e) =>
                setDraftRounds(Number(e.target.value) || "")
              }
              className="w-full rounded border px-3 py-2 text-sm"
            />
          )}

          {/* Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowDropdown((v) => !v)}
              className="w-full rounded border px-3 py-2 text-sm flex justify-between items-center"
            >
              {selectedSectors.size === 0
                ? "Select sectors..."
                : `${selectedSectors.size} selected`}
              <ChevronDown className="w-4 h-4" />
            </button>

            {showDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-48 overflow-y-auto">
                {AVAILABLE_SECTORS.map((sector) => (
                  <label
                    key={sector}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSectors.has(sector)}
                      onChange={(e) => {
                        const next = new Set(selectedSectors);
                        e.target.checked
                          ? next.add(sector)
                          : next.delete(sector);
                        setSelectedSectors(next);
                      }}
                    />
                    <span className="text-sm">{sector}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
