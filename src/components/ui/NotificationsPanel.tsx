import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import {
  getUserNotifications,
  markNotificationAsViewed,
  markAllNotificationsAsViewed,
  type Notification,
} from "@/lib/notifications";
import { X, Bell, CheckCheck, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip";
import LeagueInviteModal from "./LeagueInviteModal";
import { supabase } from "@/lib/supabase";

const LayeredTrashIcon = () => <Trash2 className="w-4 h-4" />;

export default function NotificationsPanel() {
  const { user } = useAuth();
  const { notificationsState, setNotificationsState, setUnreadCount } =
    useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [leagueInviteModal, setLeagueInviteModal] = useState<{
    open: boolean;
    notificationId: number;
    leagueId: number;
    message: string;
    joinCode?: string;
  }>({ open: false, notificationId: 0, leagueId: 0, message: "" });
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await getUserNotifications(user.id);

    if (!error && data) {
      setNotifications(data);
      const unread = data.filter((n) => !n.was_viewed).length;
      setUnreadCount(unread);
    }

    setLoading(false);
  }, [user, setUnreadCount]);

  useEffect(() => {
    if (notificationsState !== "closed") {
      void fetchNotifications();
    }
  }, [notificationsState, fetchNotifications]);

  // Subscribe to real-time notification changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refetch notifications when any change occurs
          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && panelRef.current) {
        const panelRect = panelRef.current.getBoundingClientRect();
        const newWidth = panelRect.right - mouseMoveEvent.clientX;
        setPanelWidth(newWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const handleClose = () => {
    setNotificationsState("closed");
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.was_viewed) {
      await markNotificationAsViewed(notification.notification_id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notification_id === notification.notification_id
            ? { ...n, was_viewed: true }
            : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    // Handle League Invite separately - show modal instead of closing
    if (notification.category === "League Invite" && notification.league_id) {
      setLeagueInviteModal({
        open: true,
        notificationId: notification.notification_id,
        leagueId: notification.league_id,
        message: notification.message,
        joinCode: (notification as any).join_code,
      });
      return;
    }

    setNotificationsState("closed");

    if (notification.category === "League Completed" && notification.league_id) {
      navigate(`/league/${notification.league_id}/results`);
    } else if (notification.category === "Dividend") {
      if (notification.league_id) {
        // send user to league page
        navigate(`/league/${notification.league_id}`);
      } else {
        // send user to solo
        navigate(`/solo`);
      }
    } else if (notification.category === "Badge") {
      navigate(`/profile/badges`);
    }
  };

  const handleHideNotification = async (e: React.MouseEvent, notificationId: number) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from("Notifications")
        .update({ is_hidden: true })
        .eq("notification_id", notificationId);

      if (!error) {
        setNotifications((prev) =>
          prev.filter((n) => n.notification_id !== notificationId)
        );
        const hiddenNotification = notifications.find(n => n.notification_id === notificationId);
        if (hiddenNotification && !hiddenNotification.was_viewed) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      }
    } catch (err) {
      console.error("Error hiding notification:", err);
    }
  };

  const handleMarkAllAsViewed = async () => {
    if (!user) return;
    await markAllNotificationsAsViewed(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, was_viewed: true })));
    setUnreadCount(0);
  };

  const handleDeleteAllNotifications = async () => {
    if (!user || notifications.length === 0) return;
    try {
      const { error } = await supabase
        .from("Notifications")
        .update({ is_hidden: true })
        .in(
          "notification_id",
          notifications.map((n) => n.notification_id)
        );

      if (!error) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("Error deleting all notifications:", err);
    }
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-green-700" />
        <h2 className="text-md font-medium text-green-700">Notifications</h2>
      </div>
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleMarkAllAsViewed}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-100!"
              >
                <CheckCheck className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mark all as read</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleDeleteAllNotifications}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-100!"
              >
                <LayeredTrashIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Delete all</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          onClick={handleClose}
          className="h-8 w-8 p-0 opacity-100!"
          variant="ghost"
          size="sm"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  const renderContent = () => (
    <div className="flex-1 overflow-y-auto p-4">
      {loading ? (
        <div className="flex items-center justify-center h-full text-sm text-gray-500">
          Loading...
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-gray-500">
          No notifications
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-200">
          {notifications.map((notification) => (
            <div
              key={notification.notification_id}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                !notification.was_viewed ? "bg-green-50" : "bg-white"
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <span
                className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                  !notification.was_viewed ? "bg-green-500" : "bg-transparent"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-xs text-green-700">
                  {notification.category}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {notification.message}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(notification.created_at).toLocaleDateString(
                    undefined,
                    {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-gray-700 hover:text-red-700 hover:bg-red-500/10 shrink-0"
                onClick={(e) => handleHideNotification(e, notification.notification_id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!isMobileViewport && notificationsState === "closed") return null;

  if (isMobileViewport) {
    return (
      <div>
        <button
          type="button"
          aria-label="Close notifications"
          onClick={handleClose}
          className={`fixed inset-0 bg-black/30 z-80 transition-opacity duration-300 ${
            notificationsState === "closed"
              ? "opacity-0 pointer-events-none"
              : "opacity-100 pointer-events-auto"
          }`}
        />
        <div
          className={`fixed inset-y-0 right-0 z-90 w-[88vw] max-w-sm bg-white border-l border-gray-200 flex flex-col transform transition-transform duration-300 ${
            notificationsState === "closed" ? "translate-x-full" : "translate-x-0"
          }`}
        >
          {renderHeader()}
          {renderContent()}
        </div>
        <LeagueInviteModal
          open={leagueInviteModal.open}
          notificationId={leagueInviteModal.notificationId}
          leagueId={leagueInviteModal.leagueId}
          message={leagueInviteModal.message}
          joinCode={leagueInviteModal.joinCode}
          onClose={() => {
            setLeagueInviteModal({ ...leagueInviteModal, open: false });
          }}
          onResponse={() => {
            void fetchNotifications();
          }}
          onResponseComplete={() => {
            setNotificationsState("closed");
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        ref={panelRef}
        className={`relative h-full bg-white border-l border-gray-200 flex flex-col ${
          panelWidth ? "" : "w-64 lg:w-[400px] xl:w-[400px]"
        } min-w-64 lg:min-w-80 xl:min-w-[400px] max-w-[90vw] md:max-w-[400px] xl:max-w-[600px]`}
        style={panelWidth ? { width: panelWidth } : undefined}
      >
        {/* Resize Handle */}
        <div
          className="absolute -left-px top-0 bottom-0 w-4 cursor-col-resize -translate-x-1/2 flex justify-center group"
          onMouseDown={startResizing}
        >
          <div className="w-px h-full bg-transparent group-hover:bg-gray-400 transition-colors" />
        </div>

        {renderHeader()}
        {renderContent()}
      </div>
      <LeagueInviteModal
        open={leagueInviteModal.open}
        notificationId={leagueInviteModal.notificationId}
        leagueId={leagueInviteModal.leagueId}
        message={leagueInviteModal.message}
        joinCode={leagueInviteModal.joinCode}
        onClose={() => {
          setLeagueInviteModal({ ...leagueInviteModal, open: false });
        }}
        onResponse={() => {
          void fetchNotifications();
        }}
        onResponseComplete={() => {
          setNotificationsState("closed");
        }}
      />
    </div>
  );
}