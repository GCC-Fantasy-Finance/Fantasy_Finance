import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Button } from "./button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CreateLeagueModal({ open, onClose }: Props) {
  const nameRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState<string>("");
  const [startAt, setStartAt] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  });
  const [endAt, setEndAt] = useState<string>(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  });
  const [hasTrading, setHasTrading] = useState<boolean>(true);
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [draftRounds, setDraftRounds] = useState<number | "">(3);
  const [sectorsInput, setSectorsInput] = useState<string>("Tech, Finance");
  const [createdLeagueId, setCreatedLeagueId] = useState<string | null>(null);
  const [createdDraftId, setCreatedDraftId] = useState<string | null>(null);
  const [createdDraftError, setCreatedDraftError] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState<boolean>(false);

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

  if (!open) return null;

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
        name: leagueName || name,
        owner_id: user.id,
        start_time: startAt ? new Date(startAt).toISOString() : null,
        finish_time: endAt ? new Date(endAt).toISOString() : null,
        has_trading: !!hasTrading,
        has_drafting: !!hasDraft,
        
        sectors: sectorsInput
          ? sectorsInput.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        created_at: new Date().toISOString(),
      };

      let data: any = null;
      let supaError: any = null;

      // Try insert; if the schema doesn't include draft_rounds, retry without it
      ({ data, error: supaError } = await supabase.from("Leagues").insert([payload]).select().single());

      // if (supaError) {
      //   const msg = String(supaError.message || supaError.details || "");
      //   const isMissingColumn = msg.toLowerCase().includes("draft_rounds") || msg.toLowerCase().includes("column \"draft_rounds\"") || supaError.code === "42703";
      //   if (isMissingColumn) {
      //     const payloadNoDraft = { ...payload } as any;
      //     delete payloadNoDraft.draft_rounds;
      //     ({ data, error: supaError } = await supabase.from("Leagues").insert([payloadNoDraft]).select().single());
      //   }
      // }

      if (supaError) {
        throw supaError;
      }

      console.debug("League insert result:", { data, supaError });
      console.debug("League data structure:", data);
      const leagueId = (data as any)?.league_id || (data as any)?.id;
      console.debug("Extracted leagueId:", leagueId);

      if (leagueId) {
        setCreatedLeagueId(String(leagueId));
        setCreatingDraft(true);
        setCreatedDraftError(null);
        setCreatedDraftId(null);

        

        const portfolioPayload = {
          league_id: leagueId,
          user_id: user.id,
          total_value: 10000,
          reserve_value: 10000,
          last_recalculated: new Date().toISOString(),
          is_solo: false
        };

        const {data: portfolioData} = await supabase
          .from("Portfolios")
          .insert([portfolioPayload])
          .select()
          .single()
        
        const portfolioId = portfolioData?.portfolio_id;
        

        const draftPayload = {
          league_id: leagueId,
          total_rounds: typeof draftRounds === "number" ? draftRounds : null,
          current_round: 0,
          current_pick: 0,
          current_portfolio_id: portfolioId,
          is_snaking_forward: true,
          timer_start_time: null,
          is_started: false,
          is_ended: false,
        };

        const { data: draftData, error: draftError } = await supabase
          .from("Drafts")
          .insert([draftPayload])
          .select()
          .single();

        console.debug("Draft insert result:", { draftData, draftError });

        

        // if (draftError) {
        //   console.error("Supabase error creating draft:", draftError);
        //   const draftMsg = draftError?.message || JSON.stringify(draftError);
        //   alert(`Draft error: ${JSON.stringify(draftError)}`);
        //   toast.error(`League created, but failed to create draft: ${draftMsg}`);
        //   setCreatedDraftError(draftMsg);
        // } else if (!draftData) {
        //   console.warn("Draft insert returned no data and no error", { draftData });
        //   toast.error("League created — draft insert returned no data");
        //   setCreatedDraftError("Draft insert returned no data");
        // } else {
        //   toast.success("League and draft created");
        //   console.info("Draft created:", draftData);
        //   setCreatedDraftId(String((draftData as any).id));
        // }

        setCreatingDraft(false);
        // keep modal open; user will choose to navigate/close
        onClose();


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

//   async function retryCreateDraft() {
//     if (!createdLeagueId) return;
//     setCreatingDraft(true);
//     setCreatedDraftError(null);
//     setCreatedDraftId(null);

//     const draftPayload = {
//       league_id: createdLeagueId,
//       rounds: typeof draftRounds === "number" ? draftRounds : null,
//       current_round: 0,
//       current_pick: 0,
//       current_portfolio_id: null,
//       is_snaking: true,
//       timer_start_time: null,
//       is_started: false,
//       is_ended: false,
//     };

//     console.debug("Retry draft payload:", { draftPayload });
//     const { data: draftData, error: draftError } = await supabase
//       .from("Drafts")
//       .insert([draftPayload])
//       .select()
//       .single();

//     console.debug("Retry draft result:", { draftData, draftError });
//     if (draftError) {
//       const draftMsg = draftError?.message || JSON.stringify(draftError);
//       setCreatedDraftError(draftMsg);
//       toast.error(`Retry failed: ${draftMsg}`);
//     } else if (!draftData) {
//       setCreatedDraftError("Draft insert returned no data");
//       toast.error("Retry: draft insert returned no data");
//     } else {
//       setCreatedDraftId(String((draftData as any).id));
//       setCreatedDraftError(null);
//       toast.success("Draft created on retry");
//     }

//     setCreatingDraft(false);
//   }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md rounded bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-3">Create League</h2>

        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

        {/* {createdLeagueId && (
          <div className="mb-4 p-3 border rounded bg-gray-50">
            <div className="text-sm">League created: <strong>{createdLeagueId}</strong></div>
            <div className="text-sm mt-1">
              Draft status: {creatingDraft ? "Creating..." : createdDraftId ? `Created (${createdDraftId})` : createdDraftError ? `Failed: ${createdDraftError}` : "Not created"}
            </div>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(`/`)} disabled={creatingDraft}>Go home</Button>
              <Button type="button" variant="outline" onClick={() => { setCreatedLeagueId(null); setCreatedDraftId(null); setCreatedDraftError(null); onClose(); }} disabled={creatingDraft}>Close</Button>
              {!creatingDraft && !createdDraftId && (
                <Button type="button" onClick={retryCreateDraft}>Retry draft</Button>
              )}
            </div>
          </div>
        )} */}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">League Name</label>
            <input
              ref={nameRef}
              name="leagueName"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm mb-3"
              placeholder=""
            />

            <label className="block text-sm font-medium mb-1">Start Date &amp; Time</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm mb-3"
            />

            <label className="block text-sm font-medium mb-1">End Date &amp; Time</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm mb-3"
            />
          </div>

          <div className="mb-3 flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={hasTrading} onChange={(e) => setHasTrading(e.target.checked)} />
              Has trading
            </label>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={hasDraft} onChange={(e) => setHasDraft(e.target.checked)} />
              Has draft
            </label>
          </div>

          {hasDraft && (
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Draft Rounds</label>
              <input
                type="number"
                min={1}
                value={draftRounds as number}
                onChange={(e) => setDraftRounds(Number(e.target.value) || "")}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Sectors (comma-separated)</label>
            <input
              type="text"
              value={sectorsInput}
              onChange={(e) => setSectorsInput(e.target.value)}
              placeholder="Tech, Finance, Healthcare"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} >
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
