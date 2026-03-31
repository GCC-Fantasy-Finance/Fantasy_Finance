import { useMemo, useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Info, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UserBadgeView } from "@/lib/userBadges";

export interface UserBadgeHoverProps {
  username: string;
  avatarUrl?: string | null;
  badges?: UserBadgeView[];
  joinedDate?: string | null;
  className?: string;
}

export default function UserBadgeHover({
  username,
  avatarUrl,
  badges = [],
  joinedDate,
  className = "",
}: UserBadgeHoverProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  const formattedJoinDate = useMemo(() => {
    if (!joinedDate) return "Unknown";
    const date = new Date(joinedDate);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [joinedDate]);

  const hasBadges = badges && badges.length > 0;

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div className={`flex items-center gap-2 w-full text-left ${className}`}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm select-none shrink-0">
              {(username?.[0] ?? "U").toUpperCase()}
            </div>
          )}
          <Tooltip open={showTooltip} onOpenChange={setShowTooltip}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 min-w-0">
                <span className="truncate">{username}</span>
                {hasBadges && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {badges.map((badge) => (
                      <img
                        key={badge.fixed_badge_id}
                        src={badge.image_path}
                        alt={badge.name}
                        className="w-4 h-4 object-contain"
                        title={badge.name}
                      />
                    ))}
                  </div>
                )}
              </div>
            </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={-4}
            className="bg-white text-gray-900 shadow-lg border border-gray-200 rounded-lg p-4 max-w-sm"
            arrowClassName="bg-white fill-white border border-gray-200 border-l-0 border-b-0"
          >
            <div className="space-y-3">
              <p className="text-sm font-semibold">{username}</p>
              
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">
                  Joined
                </p>
                <p className="text-sm font-medium">{formattedJoinDate}</p>
              </div>

              {hasBadges ? (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">
                    Badges
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {badges.map((badge) => (
                      <div
                        key={badge.fixed_badge_id}
                        className="flex flex-col items-center gap-1"
                      >
                        <img
                          src={badge.image_path}
                          alt={badge.name}
                          className="w-12 h-12 object-contain"
                        />
                        <p className="text-xs text-center font-medium">
                          {badge.name}
                        </p>
                        {badge.description && (
                          <p className="text-xs text-gray-500 text-center max-w-32">
                            {badge.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-full h-px bg-gray-300"></div>
                  <p className="text-xs text-gray-500">No badges</p>
                  <div className="w-full h-px bg-gray-300"></div>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
        {hasBadges && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowModal(true);
            }}
            className="ml-1 p-0.5 hover:bg-gray-200 rounded transition-colors block md:hidden"
            aria-label="View badge details"
          >
            <Info size={14} className="text-gray-500 hover:text-gray-700" />
          </button>
        )}
      </div>
    </TooltipProvider>

      {showModal && isMobile && typeof document !== "undefined"
        ? ReactDOM.createPortal(
            <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModal(false);
                }}
              />

              <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-[90vw] max-w-sm rounded bg-white p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-4 right-4">
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModal(false);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h2 className="text-lg font-semibold mb-4">{username}'s Badges</h2>

                <div className="mb-4 pb-4 border-b">
                  <p className="text-xs text-gray-500 font-medium mb-1">Joined</p>
                  <p className="text-sm font-medium">{formattedJoinDate}</p>
                </div>

                {hasBadges ? (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-3">Badges</p>
                    <div className="flex flex-wrap gap-3">
                      {badges.map((badge) => (
                        <div
                          key={badge.fixed_badge_id}
                          className="flex flex-col items-center gap-2 p-3 border rounded-lg hover:bg-gray-50 flex-1 min-w-[140px]"
                        >
                          <img
                            src={badge.image_path}
                            alt={badge.name}
                            className="w-16 h-16 object-contain"
                          />
                          <p className="text-xs text-center font-medium">
                            {badge.name}
                          </p>
                          {badge.description && (
                            <p className="text-xs text-gray-500 text-center text-[10px]">
                              {badge.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-sm text-gray-500">
                    No badges yet
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
