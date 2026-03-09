import { supabase } from "./supabase";

export interface Notification {
  notification_id: number;
  created_at: string;
  was_viewed: boolean;
  category: string;
  league_id: number | null;
  message: string;
  user_id: string;
}

/**
 * Fetch all notifications for a user
 */
export async function getUserNotifications(userId: string) {
  const { data, error } = await supabase
    .from("Notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch notifications:", error);
    return { data: null, error };
  }

  return { data: data as Notification[], error: null };
}

/**
 * Mark a notification as viewed
 */
export async function markNotificationAsViewed(notificationId: number) {
  const { error } = await supabase
    .from("Notifications")
    .update({ was_viewed: true })
    .eq("notification_id", notificationId);

  if (error) {
    console.error("Failed to mark notification as viewed:", error);
    return { error };
  }

  return { error: null };
}

/**
 * Mark all notifications as viewed
 */
export async function markAllNotificationsAsViewed(userId: string) {
  const { error } = await supabase
    .from("Notifications")
    .update({ was_viewed: true })
    .eq("user_id", userId)
    .eq("was_viewed", false);

  if (error) {
    console.error("Failed to mark all notifications as viewed:", error);
    return { error };
  }

  return { error: null };
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: number) {
  const { error } = await supabase
    .from("Notifications")
    .delete()
    .eq("notification_id", notificationId);

  if (error) {
    console.error("Failed to delete notification:", error);
    return { error };
  }

  return { error: null };
}