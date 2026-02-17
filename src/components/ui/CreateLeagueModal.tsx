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
  const [closeRef, setCloseRef] = useState(false);

  const [leagueName, setLeagueName] = useState("");
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [hasTrading, setHasTrading] = useState(true);
  const [draftRounds, setDraftRounds] = useState<number | "">(5);
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    new Set()
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [draftTime, setDraftTime] = useState<number | "">(60);

  

  

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

    if(closeRef == true){ 
      return;
    }else{
      const target = e.target as Node;

      if (!modalRef.current) return;

      if (datePickerOpen) return;

      if (showDropdown) {
        if (dropdownRef.current && !dropdownRef.current.contains(target)) {
          setShowDropdown(false);
        }
        return;
      }

      if (!modalRef.current.contains(target)) {
        onClose();
      }
    }
  }

  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, [onClose, showDropdown, datePickerOpen]);


  // Reset modal when closed
  useEffect(() => {
    if (!open) {
      setLeagueName("");
      setStartAt(defaultStart());
      setEndAt(defaultEnd());
      setHasTrading(true);
      setDraftRounds(5);
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
    if ((!draftRounds || Number(draftRounds) < 5 || Number(draftRounds) > 30)) {
      return setError("Draft rounds must be between 5 and 30.");
    }
    if (new Date(startAt) > new Date(endAt)) {
      return setError("Start must be before end.");
    }
    if((Number(draftTime) < 10 || Number(draftTime) > 600)){
      return setError("Draft time must be between 10 seconds and 10 minutes.");
    }

    setLoading(true);

    try {

      
      

      const { data, error } = await supabase
        .from("Leagues")
        .insert([
          {
            name: leagueName.trim(),
            owner_id: user.id,
            start_time: new Date(startAt).toISOString(),
            finish_time: new Date(endAt).toISOString(),
            has_trading: hasTrading,
            has_drafting: true,
            sectors:
              selectedSectors.size > 0
                ? Array.from(selectedSectors)
                : ["Any"],
           
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
            total_rounds: draftRounds,
            seconds_per_pick: draftTime,
            
          },
        ]);
      

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
            onChange={(e) => {
              const value = e.target.value;
              if (value.length <= 20) {
                setLeagueName(value);
              }
            }}

            onBlur ={() => {
              if (leagueName.trim() === "") {
                setError("League name required.");
              }
              else {                
                setError(null);
              }
            }}
            placeholder="League name"
            className="w-full rounded border px-3 py-2 text-sm"
          />

          <input
            type="datetime-local"
            value={startAt}
            onFocus={() => setDatePickerOpen(true)}
            onBlur={() => setDatePickerOpen(false)}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />

          <input
            type="datetime-local"
            value={endAt}
            onFocus={() => setDatePickerOpen(true)}
            onBlur={() => setDatePickerOpen(false)}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />


          

          <label className="text-sm">Number of Draft Rounds</label>
          
            <input
              type="number"
              
              value={draftRounds}
              onChange={(e) => {
                const value = e.target.value;
                setDraftRounds(value === "" ? "" : Number(value));
              }}
              onBlur={() => {
                
                if (Number(draftRounds) < 5 || Number(draftRounds) > 30) {
                  setError("Draft rounds must be between 5 and 30.");

                } else {
                  setError(null);
                }
              }}
              className="w-full rounded border px-3 py-2 text-sm"
            />
        
          <div className="text-sm">
            Time Per Pick (seconds)
            <input
              type="number"
              value={draftTime}
              onChange={(e) => {
                const value = e.target.value;
                setDraftTime(value === "" ? "" : Number(value));
              }}
              onBlur={() => {
                if (draftTime === "") {
                  setError("Draft time is required.");
                } else if (Number(draftTime) < 10 || Number(draftTime) > 600) {
                  setError("Draft time must be between 10 seconds and 10 minutes.");
                } else {
                  setError(null);
                }
              }}
              className="w-full rounded border px-3 py-2 text-sm"
            />
            
          </div>

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
              onClick={() => {
                setCloseRef(true);
                onClose();
              }}
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
