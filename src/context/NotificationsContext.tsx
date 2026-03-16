import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";

interface NotificationsContextType {
  notificationsState: "closed" | "open";
  setNotificationsState: (state: "closed" | "open") => void;
  isPinned: boolean;
  setIsPinned: (pinned: boolean) => void;
  unreadCount: number;
  setUnreadCount: (count: number | ((prev: number) => number)) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notificationsState, setNotificationsState] = useState<"closed" | "open">("closed");
  const [isPinned, setIsPinned] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setUnreadCount(0);
        return;
      }

      const { data, error } = await supabase
        .from("Notifications")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .eq("was_viewed", false)
        .eq("is_hidden", false)
        .neq("status", "cancelled");

      if (!error && data) {
        setUnreadCount(data.length);
      }
    } catch (err) {
      console.error("Error fetching unread count:", err);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, []);

  // Subscribe to real-time notification changes
  useEffect(() => {
    let isMounted = true;

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;
      
      const currentUserId = user.id;

      // Listen for INSERT, UPDATE, and DELETE via postgres_changes
      const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "Notifications",
          },
          (payload: any) => {
            if (!isMounted) return;
            
            if (payload.new?.user_id === currentUserId) {
              console.log("Notification INSERT detected");
              fetchUnreadCount();
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "Notifications",
          },
          (payload: any) => {
            if (!isMounted) return;
            
            if (payload.new?.user_id === currentUserId) {
              console.log("Notification UPDATE detected", payload.new?.status);
              fetchUnreadCount();
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "Notifications",
          },
          (payload: any) => {
            if (!isMounted) return;
            
            if (payload.old?.user_id === currentUserId) {
              console.log("Notification DELETE detected");
              fetchUnreadCount();
            }
          }
        )
        .subscribe();

      return channel;
    };

    let channel: any;
    setupSubscription().then((ch) => {
      channel = ch;
    });

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchUnreadCount]);

  return (
    <NotificationsContext.Provider
      value={{
        notificationsState,
        setNotificationsState,
        isPinned,
        setIsPinned,
        unreadCount,
        setUnreadCount,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}