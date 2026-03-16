import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type Props = {
  open: boolean;
  notificationId: number;
  leagueId: number;
  message: string;
  onClose: () => void;
  onResponse: () => void;
};

export default function LeagueInviteModal({
  open,
  notificationId,
  leagueId,
  message,
  onClose,
  onResponse,
}: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [leagueDetails, setLeagueDetails] = useState<{
    name?: string;
    owner_id?: string;
    start_time?: string;
  } | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(true);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (modalRef.current && !modalRef.current.contains(target)) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const fetchLeagueDetails = async () => {
      try {
        setLeagueLoading(true);
        const { data, error } = await supabase
          .from("Leagues")
          .select("name, owner_id, start_time")
          .eq("league_id", leagueId)
          .single();

        if (!error && data) {
          setLeagueDetails(data);
        }
      } catch (err) {
        console.error("Error fetching league details:", err);
      } finally {
        setLeagueLoading(false);
      }
    };

    fetchLeagueDetails();
  }, [open, leagueId]);

  const handleDecline = async () => {
    setDeclineLoading(true);
    try {
      const { error } = await supabase
        .from("Notifications")
        .update({ is_hidden: true })
        .eq("notification_id", notificationId);

      if (error) {
        toast.error("Failed to decline invite");
        return;
      }

      onResponse();
      onClose();
    } catch (err) {
      console.error("Error declining notification:", err);
      toast.error("Failed to decline invite");
    } finally {
      setDeclineLoading(false);
    }
  };

  const handleAccept = async () => {
    setAcceptLoading(true);
    try {
      // Get user ID from auth
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        toast.error("Not authenticated");
        return;
      }

      const portfolioPayload = {
        league_id: leagueId,
        user_id: authData.user.id,
        previous_close_value: 10000,
        reserve_value: 10000,
        last_recalculated: new Date().toISOString(),
        is_solo: false,
      };

      // Check if user already exists in league
      const { data: existingPortfolio, error: portfolioError } = await supabase
        .from("Portfolios")
        .select("portfolio_id")
        .eq("league_id", leagueId)
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (existingPortfolio) {
        toast.error("You are already in this league");
        return;
      }
      if (portfolioError) throw portfolioError;

      // Create portfolio
      const { data: portfolioData, error: supaError } = await supabase
        .from("Portfolios")
        .insert([portfolioPayload])
        .select()
        .single();

      if (supaError) {
        console.error("Error creating portfolio:", supaError);
        throw supaError;
      }

      console.log("Portfolio created:", portfolioData);

      // Create portfolio history entry
      const { error: historyError } = await supabase
        .from("Portfolio Histories")
        .insert([
          {
            portfolio_id: portfolioData?.portfolio_id,
            value: 10000,
          },
        ]);
      
      if (historyError) {
        console.error("Error creating portfolio history:", historyError);
        throw historyError;
      }

      console.log("Portfolio history created");

      // Delete notification
      const { error: notificationError } = await supabase
        .from("Notifications")
        .delete()
        .eq("notification_id", notificationId);

      if (notificationError) {
        console.error("Error deleting notification:", notificationError);
      } else {
        console.log("Notification deleted");
      }

      toast.success("Joined league successfully!");
      onResponse();
      onClose();
      
      // Reload page to reflect new portfolio and league
      setTimeout(() => {
        console.log("Reloading page to reflect league membership");
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error("Error accepting invite:", err);
      toast.error("Failed to join league");
    } finally {
      setAcceptLoading(false);
    }
  };

  if (!open) return null;

  const modal = (
    <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded bg-white shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">League Invitation</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-6">
          <p className="text-sm text-gray-700 mb-4">{message}</p>

          {leagueLoading ? (
            <div className="text-sm text-gray-500 text-center py-6">
              Loading league details...
            </div>
          ) : leagueDetails ? (
            <div className="bg-gray-50 rounded p-3 mb-6">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">League:</span>
                  <span className="ml-2 font-medium">{leagueDetails.name}</span>
                </div>
                {leagueDetails.start_time && (
                  <div>
                    <span className="text-gray-600">Starts:</span>
                    <span className="ml-2 font-medium">
                      {new Date(leagueDetails.start_time).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Footer */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={declineLoading || acceptLoading}
              className="flex-1"
            >
              Decline
            </Button>
            <Button
              onClick={handleAccept}
              disabled={declineLoading || acceptLoading}
              className="flex-1"
            >
              {acceptLoading ? "Joining..." : "Accept & Join"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
