import { useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type ReportReason = "inappropriate_profile_picture" | "inappropriate_username" | "cheating" | "other";

type Props = {
  open: boolean;
  userName?: string;
  reportedUserId?: string;
  onClose: () => void;
};

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "inappropriate_profile_picture", label: "Inappropriate Profile Picture" },
  { value: "inappropriate_username", label: "Inappropriate Username" },
  { value: "cheating", label: "Cheating" },
  { value: "other", label: "Other" },
];

export default function ReportUserModal({ open, userName, reportedUserId, onClose }: Props) {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [loading, setLoading] = useState(false);

  if (open) {
    console.debug("ReportUserModal opened with reportedUserId:", reportedUserId, "type:", typeof reportedUserId);
    if (!reportedUserId) {
      console.warn("WARNING: reportedUserId is missing or empty!");
    }
  }

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error("Unable to submit report: user not authenticated");
      return;
    }

    if (!reportedUserId) {
      toast.error("Unable to submit report: user ID is missing");
      return;
    }

    if (!selectedReason) {
      toast.error("Please select a reason");
      return;
    }

    // Ensure both user IDs are valid UUID strings
    const reportingUserIdStr = String(user.id).trim();
    const reportedUserIdStr = String(reportedUserId).trim();
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(reportingUserIdStr)) {
      console.error("Invalid reporting user UUID:", reportingUserIdStr);
      toast.error("Authentication error: invalid session. Please refresh and try again.");
      return;
    }

    if (!uuidRegex.test(reportedUserIdStr)) {
      console.error("Invalid reported user UUID:", reportedUserIdStr);
      toast.error("Cannot report user: invalid user ID. Please try again or contact support.");
      return;
    }

    setLoading(true);

    try {
      console.log("DEBUG: About to call submit_report with:", {
        p_reporting_user: user.id,
        p_reported_user: reportedUserIdStr,
        p_reason: selectedReason,
        p_custom_message: selectedReason === "other" ? customMessage : null,
      });

      const { data, error } = await supabase.rpc("submit_report", {
        p_reporting_user: user.id,
        p_reported_user: reportedUserIdStr,
        p_reason: selectedReason,
        p_custom_message: selectedReason === "other" ? customMessage : null,
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        toast.error(data.error || "Failed to submit report");
        return;
      }

      toast.success("Report submitted successfully");
      setSelectedReason(null);
      setCustomMessage("");
      onClose();
    } catch (err) {
      console.error("Report submission error:", err);
      toast.error(
        err instanceof Error && err.message.includes("DUPLICATE_PENDING_REPORT")
          ? "You already have a pending report for this user"
          : "Failed to submit report"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSelectedReason(null);
      setCustomMessage("");
      onClose();
    }
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isValid = selectedReason && (selectedReason !== "other" || customMessage.trim());

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onMouseDown={handleClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[95vw] max-w-md rounded bg-white p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-semibold mb-4">Report {userName ?? "User"}</h2>

        <div className="space-y-2 mb-5">
          {REPORT_REASONS.map((reason) => (
            <label key={reason.value} className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-green-50">
              <input
                type="radio"
                name="report-reason"
                value={reason.value}
                checked={selectedReason === reason.value}
                onChange={() => setSelectedReason(reason.value)}
                className="w-4 h-4 accent-green-600"
              />
              <span className="text-sm">{reason.label}</span>
            </label>
          ))}
        </div>

        {selectedReason === "other" && (
          <div className="mb-5">
            <label htmlFor="custom-message" className="block text-sm font-medium text-gray-700 mb-2">
              Please describe the issue
            </label>
            <textarea
              id="custom-message"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Enter additional details..."
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={4}
            />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting..." : "Submit Report"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
