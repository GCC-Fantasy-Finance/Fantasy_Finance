import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
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

const SECTOR_STOCK_COUNTS: Record<string, number> = {
  Technology: 29,
  Finance: 29,
  Healthcare: 30,
  Energy: 19,
  Industrials: 22,
  "Consumer Discretionary": 24,
  "Consumer Staples": 21,
  Materials: 15,
  "Real Estate": 20,
  Utilities: 15,
  "Communication Services": 19,
};

type Props = {
  open: boolean;
  onClose: () => void;
};

function defaultStart() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultEnd() {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}`;
}

export default function CreateLeagueModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const startDateRef = useRef<HTMLInputElement | null>(null);
  const endDateRef = useRef<HTMLInputElement | null>(null);
  const isClosingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [leagueName, setLeagueName] = useState("");
  const [startAt, setStartAt] = useState(defaultStart());
  const [endAt, setEndAt] = useState(defaultEnd());
  const [hasTrading, setHasTrading] = useState(true);
  const [draftRounds, setDraftRounds] = useState<number | "">(5);
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    new Set(),
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [draftTime, setDraftTime] = useState<number | "">(60);

  const validateLeagueDates = () => {
    const now = new Date();
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (startDate < now) {
      return {
        field: "startDate",
        message: "Start date cannot be in the past.",
      };
    }
    if (endDate < now) {
      return { field: "endDate", message: "End date cannot be in the past." };
    }
    if (endDate < startDate) {
      return {
        field: "endDate",
        message: "End date must be after start date.",
      };
    }

    return null;
  };

  // console.log("USER:", user);

  // ESC handling
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDropdown) setShowDropdown(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, showDropdown]);

  // Only auto-focus league name when modal first opens.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => nameRef.current?.focus(), 0);
  }, [open]);

  // Reset modal when closed
  useEffect(() => {
    if (!open) {
      isClosingRef.current = false;
      setLeagueName("");
      setStartAt(defaultStart());
      setEndAt(defaultEnd());
      setHasTrading(true);
      setDraftRounds(5);
      setSelectedSectors(new Set());
      setShowDropdown(false);
      setDraftTime(60);
      setError(null);
      setErrorField(null);
      setLoading(false);
    }
  }, [open]);

  const totalStocksInSelectedSectors =
    selectedSectors.size === 0
      ? AVAILABLE_SECTORS.reduce(
          (sum, sector) => sum + (SECTOR_STOCK_COUNTS[sector] ?? 0),
          0,
        )
      : Array.from(selectedSectors).reduce(
          (sum, sector) => sum + (SECTOR_STOCK_COUNTS[sector] ?? 0),
          0,
        );

  const sectorSummaryLabel =
    selectedSectors.size === 0
      ? `Any (${totalStocksInSelectedSectors} stocks)`
      : `${selectedSectors.size} selected (${totalStocksInSelectedSectors} stocks)`;

  const maxMembers =
    typeof draftRounds === "number" && draftRounds > 0
      ? Math.floor(totalStocksInSelectedSectors / draftRounds)
      : 0;

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!leagueName.trim()) {
      setError("League name required.");
      setErrorField("name");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      setErrorField(null);
      return;
    }
    if (!draftRounds || Number(draftRounds) < 5 || Number(draftRounds) > 30) {
      setError("Draft rounds must be between 5 and 30.");
      setErrorField("rounds");
      return;
    }
    const dateError = validateLeagueDates();
    if (dateError) {
      setError(dateError.message);
      setErrorField(dateError.field);
      return;
    }
    if (Number(draftTime) < 10 || Number(draftTime) > 600) {
      setError("Draft time must be between 10 seconds and 10 minutes.");
      setErrorField("time");
      return;
    }

    setLoading(true);

    try {
      // Parse end date to 4:30 PM
      const endDate = new Date(`${endAt}T16:30:00`);

      const { data: leagueId, error: rpcError } = await supabase.rpc(
        "create_league",
        {
          p_name: leagueName.trim(),
          p_start_time: new Date(startAt).toISOString(),
          p_end_time: endDate.toISOString(),
          p_has_trading: hasTrading,
          p_sectors:
            selectedSectors.size > 0
              ? Array.from(selectedSectors)
              : ["Any"],
          p_draft_rounds: draftRounds,
          p_seconds_per_pick: draftTime,
        }
      );

      if (rpcError) {
        const msg = rpcError.message || "Failed to create league";
        setError(msg);
        setErrorField(null);
        toast.error(msg);
        return;
      }

      // ✅ Success
      toast.success("League created");

      window.dispatchEvent(
        new CustomEvent("ff:leagues-updated", {
          detail: { leagueId },
        })
      );

      onClose();
      navigate(`/league/${leagueId}`);
    } catch (err: any) {
      setError(err.message || "Failed to create league");
      setErrorField(null);
      toast.error(err.message || "Failed to create league");
    } finally {
      setLoading(false);
    }
  }

  const modal = (
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onMouseDown={(e) => {
          const activeElement = document.activeElement as HTMLElement | null;
          const dateInputIsFocused =
            activeElement === startDateRef.current ||
            activeElement === endDateRef.current;

          if (showDropdown || datePickerOpen || dateInputIsFocused) {
            e.preventDefault();
            setShowDropdown(false);
            setDatePickerOpen(false);
            activeElement?.blur();
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
        onClick={(e) => {
          if (
            showDropdown &&
            dropdownRef.current &&
            !dropdownRef.current.contains(e.target as Node)
          ) {
            setShowDropdown(false);
          }
        }}
        className="relative z-10 w-full max-w-md rounded bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto"
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
            onFocus={() => {
              if (errorField === "name") setErrorField(null);
            }}
            onBlur={() => {
              if (isClosingRef.current) return;
              if (leagueName.trim() === "") {
                setError("League name required.");
                setErrorField("name");
              } else {
                setError(null);
                setErrorField(null);
              }
            }}
            placeholder="League name"
            className={`w-full rounded border px-3 py-2 text-sm ${errorField === "name" ? "border-2 border-red-500" : ""}`}
          />

          <label className="text-sm">Draft Start Time</label>
          <input
            ref={startDateRef}
            type="datetime-local"
            value={startAt}
            onFocus={() => {
              setDatePickerOpen(true);
              if (errorField === "startDate" || errorField === "dates")
                setErrorField(null);
            }}
            onBlur={() => {
              if (isClosingRef.current) return;
              setDatePickerOpen(false);
              const dateError = validateLeagueDates();
              if (dateError) {
                setError(dateError.message);
                setErrorField(dateError.field);
              } else if (
                errorField === "startDate" ||
                errorField === "endDate" ||
                errorField === "dates"
              ) {
                setError(null);
                setErrorField(null);
              }
            }}
            onChange={(e) => setStartAt(e.target.value)}
            className={`w-full rounded border px-3 py-2 text-sm ${errorField === "startDate" || errorField === "dates" ? "border-2 border-red-500" : ""}`}
          />

          <label className="text-sm">League End Date (4:30 PM)</label>
          <input
            ref={endDateRef}
            type="date"
            value={endAt}
            onFocus={() => {
              setDatePickerOpen(true);
              if (errorField === "endDate" || errorField === "dates")
                setErrorField(null);
            }}
            onBlur={() => {
              if (isClosingRef.current) return;
              setDatePickerOpen(false);
              const dateError = validateLeagueDates();
              if (dateError) {
                setError(dateError.message);
                setErrorField(dateError.field);
              } else if (
                errorField === "startDate" ||
                errorField === "endDate" ||
                errorField === "dates"
              ) {
                setError(null);
                setErrorField(null);
              }
            }}
            onChange={(e) => setEndAt(e.target.value)}
            className={`w-full rounded border px-3 py-2 text-sm ${errorField === "endDate" || errorField === "dates" ? "border-2 border-red-500" : ""}`}
          />

          <label className="text-sm">Number of Draft Rounds</label>

          <input
            type="number"
            value={draftRounds}
            onFocus={() => {
              if (errorField === "rounds") setErrorField(null);
            }}
            onChange={(e) => {
              const value = e.target.value;
              setDraftRounds(value === "" ? "" : Number(value));
            }}
            onBlur={() => {
              if (isClosingRef.current) return;

              if (Number(draftRounds) < 5 || Number(draftRounds) > 30) {
                setError("Draft rounds must be between 5 and 30.");
                setErrorField("rounds");
              } else {
                setError(null);
                setErrorField(null);
              }
            }}
            className={`w-full rounded border px-3 py-2 text-sm ${errorField === "rounds" ? "border-2 border-red-500" : ""}`}
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
              onFocus={() => {
                if (errorField === "time") setErrorField(null);
              }}
              onBlur={() => {
                if (isClosingRef.current) return;
                if (draftTime === "") {
                  setError("Draft time is required.");
                  setErrorField("time");
                } else if (Number(draftTime) < 10 || Number(draftTime) > 600) {
                  setError(
                    "Draft time must be between 10 seconds and 10 minutes.",
                  );
                  setErrorField("time");
                } else {
                  setError(null);
                  setErrorField(null);
                }
              }}
              className={`w-full rounded border px-3 py-2 text-sm ${errorField === "time" ? "border-2 border-red-400" : ""}`}
            />
          </div>

          {/* Dropdown */}
          <div className="text-sm">Filter by sector (optional)</div>
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onMouseDown={() => {
                (document.activeElement as HTMLElement | null)?.blur();
              }}
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown((v) => !v);
              }}
              className="w-full rounded border px-3 py-2 text-sm flex justify-between items-center"
            >
              {sectorSummaryLabel}
              <ChevronDown className="w-4 h-4" />
            </button>

            {showDropdown && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute z-20 bottom-full mb-1 w-full bg-white border rounded shadow max-h-48 overflow-y-auto"
              >
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
                    <span className="text-sm">
                      {sector} ({SECTOR_STOCK_COUNTS[sector] ?? 0})
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">Max {maxMembers} members</p>

          <div className="flex justify-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onMouseDown={() => {
                isClosingRef.current = true;
              }}
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
