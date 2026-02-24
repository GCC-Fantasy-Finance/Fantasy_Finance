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
  const [startAt, setStartAt] = useState(defaultStart());
  const [endAt, setEndAt] = useState(defaultEnd());
  const [hasTrading, setHasTrading] = useState(true);
  const [draftRounds, setDraftRounds] = useState<number | "">(5);
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    new Set()
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [draftTime, setDraftTime] = useState<number | "">(60);

  console.log("USER:", user);

  

  

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
      setErrorField(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!leagueName.trim()) { setError("League name required."); setErrorField('name'); return; }
    if (!user) { setError("You must be signed in."); setErrorField(null); return; }
    if ((!draftRounds || Number(draftRounds) < 5 || Number(draftRounds) > 30)) {
      setError("Draft rounds must be between 5 and 30."); setErrorField('rounds'); return;
    }
    if (new Date(startAt) > new Date(endAt)) {
      setError("Start must be before end."); setErrorField('dates'); return;
    }
    if((Number(draftTime) < 10 || Number(draftTime) > 600)){
      setError("Draft time must be between 10 seconds and 10 minutes."); setErrorField('time'); return;
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
      window.location.href = `/leagues/${data.league_id}`;
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create league");
      setErrorField(null);
      toast.error(err.message || "Failed to create league");
    } finally {
      setLoading(false);
    }

    



  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (showDropdown) {
            setShowDropdown(false);
          } else {
            onClose();
          }
        }}
      />
      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => { if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) { setShowDropdown(false); } }}
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

            onFocus={() => { if (errorField === 'name') setErrorField(null); }}
            onBlur ={() => {
              if (leagueName.trim() === "") {
                setError("League name required.");
                setErrorField('name');
              }
              else {                
                setError(null);
                setErrorField(null);
              }
            }}
            placeholder="League name"
            className={`w-full rounded border px-3 py-2 text-sm ${errorField === 'name' ? 'border-2 border-red-500' : ''}`}
          />

          <input
            type="datetime-local"
            value={startAt}
            onFocus={() => { setDatePickerOpen(true); if (errorField === 'dates') setErrorField(null); }}
            onBlur={() => setDatePickerOpen(false)}
            onChange={(e) => setStartAt(e.target.value)}
            className={`w-full rounded border px-3 py-2 text-sm ${errorField === 'dates' ? 'border-2 border-red-500' : ''}`}
          />

          <input
            type="datetime-local"
            value={endAt}
            onFocus={() => { setDatePickerOpen(true); if (errorField === 'dates') setErrorField(null); }}
            onBlur={() => setDatePickerOpen(false)}
            onChange={(e) => setEndAt(e.target.value)}
            className={`w-full rounded border px-3 py-2 text-sm ${errorField === 'dates' ? 'border-2 border-red-500' : ''}`}
          />


          

          <label className="text-sm">Number of Draft Rounds</label>
          
            <input
              type="number"
              
              value={draftRounds}
              onFocus={() => { if (errorField === 'rounds') setErrorField(null); }}
              onChange={(e) => {
                const value = e.target.value;
                setDraftRounds(value === "" ? "" : Number(value));
              }}
              onBlur={() => {
                
                if (Number(draftRounds) < 5 || Number(draftRounds) > 30) {
                  setError("Draft rounds must be between 5 and 30.");
                  setErrorField('rounds');

                } else {
                  setError(null);
                  setErrorField(null);
                }
              }}
              className={`w-full rounded border px-3 py-2 text-sm ${errorField === 'rounds' ? 'border-2 border-red-500' : ''}`}
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
              onFocus={() => { if (errorField === 'time') setErrorField(null); }}
              onBlur={() => {
                if (draftTime === "") {
                  setError("Draft time is required.");
                  setErrorField('time');
                } else if (Number(draftTime) < 10 || Number(draftTime) > 600) {
                  setError("Draft time must be between 10 seconds and 10 minutes.");
                  setErrorField('time');
                } else {
                  setError(null);
                  setErrorField(null);
                }
              }}
              className={`w-full rounded border px-3 py-2 text-sm ${errorField === 'time' ? 'border-2 border-red-400' : ''}`}
            />
            
          </div>

          {/* Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowDropdown((v) => !v); }}
              className="w-full rounded border px-3 py-2 text-sm flex justify-between items-center"
            >
              {selectedSectors.size === 0
                ? "Select sectors..."
                : `${selectedSectors.size} selected`}
              <ChevronDown className="w-4 h-4" />
            </button>

            {showDropdown && (
              <div onClick={(e) => e.stopPropagation()} className="absolute z-20 bottom-full mb-1 w-full bg-white border rounded shadow max-h-48 overflow-y-auto">
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
                setError(null);
                setErrorField(null);
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
