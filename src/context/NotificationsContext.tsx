import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

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