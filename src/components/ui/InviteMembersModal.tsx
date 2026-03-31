import { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Input } from "./input";
import SearchIcon from "./search-icon";
import { Button } from "./button";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  leagueId: string | undefined;
  leagueName: string;
  ownerName: string;
  ownerId?: string;
  leaderboard: Array<{ user_id: string }>;
  onClose: () => void;
};

export default function InviteMembersModal({
  open,
  leagueId,
  leagueName,
  ownerName,
  ownerId,
  leaderboard,
  onClose,
}: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "pending">("search");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; username?: string; email?: string }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<
    Array<{ notification_id: number; username?: string; email?: string; user_id?: string }>
  >([]);
  const [declinedInvites, setDeclinedInvites] = useState<
    Array<{ notification_id: number; username?: string; email?: string; user_id?: string }>
  >([]);
  const [declinedUserIds, setDeclinedUserIds] = useState<Set<string>>(new Set());
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());
  const [leagueMembers, setLeagueMembers] = useState<Set<string>>(new Set());

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

  // Refetch invites from database
  const refetchInvites = useCallback(async () => {
    if (!leagueId) return;
    try {
      console.log("refetchInvites called");
      const { data, error } = await supabase
        .from("Notifications")
        .select("notification_id, user_id, is_hidden, status")
        .eq("league_id", Number(leagueId))
        .eq("category", "League Invite");

      if (error) {
        console.error("Error fetching notifications:", error);
        return;
      }

      if (!data) {
        return;
      }

      // Get all user IDs and fetch their profiles separately
      const userIds = [...new Set(data.map((n: any) => n.user_id))];
      let profiles: any[] = [];
      
      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("Profiles")
          .select("id, username, email")
          .in("id", userIds);
        
        if (profileError) {
          console.error("Error fetching profiles:", profileError);
        }
        profiles = profileData || [];
      }

      const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

      // Separate pending and declined invites
      const pending: typeof pendingInvites = [];
      const declined: typeof declinedInvites = [];
      const declinedSet = new Set<string>();
      const pendingSet = new Set<string>();

      for (const notif of data as any) {
        const profile = profileMap.get(notif.user_id);
        
        // Skip cancelled invites
        if (notif.status === "cancelled") {
          continue;
        }
        
        if (notif.is_hidden) {
          // Hidden = declined (prevents re-invite)
          declined.push({
            notification_id: notif.notification_id,
            username: profile?.username,
            email: profile?.email,
            user_id: notif.user_id,
          });
          declinedSet.add(notif.user_id);
        } else {
          // Pending invite (not yet responded)
          pending.push({
            notification_id: notif.notification_id,
            username: profile?.username,
            email: profile?.email,
            user_id: notif.user_id,
          });
          pendingSet.add(notif.user_id);
        }
      }

      console.log("Updated invites - pending:", pending.length, "declined:", declined.length);
      setPendingInvites(pending);
      setDeclinedInvites(declined);
      setDeclinedUserIds(declinedSet);
      setPendingUserIds(pendingSet);
    } catch (err) {
      console.error("Error fetching invites:", err);
    }
  }, [leagueId]);

  // Fetch and subscribe to league members from Portfolios table
  const refetchLeagueMembers = useCallback(async () => {
    if (!leagueId) return;
    try {
      console.log("refetchLeagueMembers called");
      const { data, error } = await supabase
        .from("Portfolios")
        .select("user_id")
        .eq("league_id", Number(leagueId));

      if (error) {
        console.error("Error fetching league members:", error);
        return;
      }

      const memberIds = new Set((data || []).map((p: any) => p.user_id));
      console.log("League members updated:", memberIds.size);
      setLeagueMembers(memberIds);
    } catch (err) {
      console.error("Error fetching league members:", err);
    }
  }, [leagueId]);

  useEffect(() => {
    if (!open) {
      setUserSearchQuery("");
      setSearchResults([]);
      setInviteLoading(null);
      setPendingInvites([]);
      setDeclinedInvites([]);
      setDeclinedUserIds(new Set());
      setPendingUserIds(new Set());
      setLeagueMembers(new Set());
      setActiveTab("search");
      return;
    }

    // Fetch pending invites and league members on open
    refetchInvites();
    refetchLeagueMembers();
  }, [open, leagueId, refetchInvites, refetchLeagueMembers]);

  // Subscribe to real-time updates on Notifications
  useEffect(() => {
    if (!open || !leagueId) return;

    let isMounted = true;
    const numericLeagueId = Number(leagueId);

    const channel = supabase
      .channel(`notifications:league_${leagueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Notifications",
        },
        async (payload: any) => {
          if (!isMounted) return;
          
          const payloadLeagueId = payload.new?.league_id || payload.old?.league_id;
          
          // For DELETE events, payload.old only has primary key, so refetch anyway
          if (payload.eventType === "DELETE" || payloadLeagueId === numericLeagueId) {
            console.log(`Notification ${payload.eventType} detected, refetching invites...`);
            refetchInvites();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Notifications subscription ready");
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [open, leagueId, refetchInvites]);

  // Subscribe to portfolio changes (detect when users join/leave league)
  useEffect(() => {
    if (!open || !leagueId) return;

    let isMounted = true;

    const channel = supabase
      .channel(`portfolios:league_${leagueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Portfolios",
          filter: `league_id=eq.${leagueId}`,
        },
        async () => {
          if (!isMounted) return;
          console.log("League membership change detected");
          refetchLeagueMembers();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [open, leagueId, refetchLeagueMembers]);

  const handleCancelInvite = async (notificationId: number) => {
    try {
      const canceledInvite = pendingInvites.find(
        (inv) => inv.notification_id === notificationId
      );

      const { data, error } = await supabase.rpc('cancel_league_invite', {
        p_notification_id: notificationId,
        p_league_id: Number(leagueId),
      }) as { data: { success: boolean; error?: string } | null; error: any };

      if (error || !data?.success) {
        console.error("Error canceling invite:", error || data?.error);
        alert(data?.error || "Failed to cancel invite");
        return;
      }

      // Immediately update UI to show invite can be sent again
      if (canceledInvite?.user_id) {
        setPendingInvites(
          pendingInvites.filter((inv) => inv.notification_id !== notificationId)
        );
        setPendingUserIds(
          (prev) =>
            new Set(Array.from(prev).filter((id) => id !== canceledInvite.user_id))
        );
      }
    } catch (err) {
      console.error("Error canceling invite:", err);
      alert("Failed to cancel invite");
    }
  };

  useEffect(() => {
    const searchProfiles = async () => {
      if (!userSearchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      try {
        const query = userSearchQuery.toLowerCase().trim();
        const { data, error } = await supabase
          .from("Profiles")
          .select("id, username, email")
          .or(`username.ilike.%${query}%,email.ilike.%${query}%`);

        if (!error && data) {
          // Filter out the owner but include declined users
          const filtered = (
            data as Array<{ id: string; username?: string; email?: string }>
          ).filter((user) => user.id !== ownerId);
          setSearchResults(filtered);
        }
      } catch (err) {
        console.error("Error searching profiles:", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    const timeout = setTimeout(() => {
      searchProfiles();
    }, 300);

    return () => clearTimeout(timeout);
  }, [userSearchQuery, leaderboard, declinedUserIds, pendingUserIds, ownerId]);

  const handleInviteMember = async (userId: string) => {
    if (!leagueId) return;

    setInviteLoading(userId);
    try {
      const { data, error } = await supabase.rpc('invite_user_to_league', {
        p_user_id: userId,
        p_league_id: Number(leagueId),
        p_league_name: leagueName,
        p_owner_name: ownerName,
      }) as { data: { success: boolean; error?: string; message?: string } | null; error: any };

      if (error) {
        alert((data as any)?.error || 'Failed to send invite');
        return;
      }

      if (data?.success) {
        // Remove the invited user from search results
        setSearchResults(searchResults.filter((user) => user.id !== userId));
      } else {
        alert((data as any)?.error || 'Failed to send invite');
      }
    } catch (err) {
      console.error('Error sending invite:', err);
      alert('Failed to send invite');
    } finally {
      setInviteLoading(null);
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
        className="relative z-10 w-full max-w-md h-96 rounded bg-white shadow-lg flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold">Invite Members</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <nav className="h-12 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
          <ul className="flex gap-1">
            <li>
              <button
                type="button"
                onClick={() => setActiveTab("search")}
                aria-current={activeTab === "search" ? "page" : undefined}
                className={`relative px-3 py-3 transition-colors group cursor-pointer ${
                  activeTab === "search" ? "font-medium text-green-700" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="pointer-events-none">Search</span>
                <span
                  className={`absolute -left-0.5 -right-0.5 h-[2.5px] ${
                    activeTab === "search"
                      ? "bg-green-700"
                      : "bg-transparent group-hover:bg-gray-300"
                  } bottom-0`}
                />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                aria-current={activeTab === "pending" ? "page" : undefined}
                className={`relative px-3 py-3 transition-colors group cursor-pointer ${
                  activeTab === "pending" ? "font-medium text-green-700" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="pointer-events-none">Invites ({pendingInvites.length + declinedInvites.length})</span>
                <span
                  className={`absolute -left-0.5 -right-0.5 h-[2.5px] ${
                    activeTab === "pending"
                      ? "bg-green-700"
                      : "bg-transparent group-hover:bg-gray-300"
                  } bottom-0`}
                />
              </button>
            </li>
          </ul>
        </nav>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Search Tab */}
          {activeTab === "search" && (
            <>
              {/* Search Bar */}
              <div className="px-4 py-3 border-b border-gray-200 sticky top-0 bg-white shrink-0">
                <div className="relative">
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10">
                    <SearchIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Search users..."
                    className="pl-8 pr-8"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUserSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Search Results */}
              {searchLoading && (
                <div className="p-4 text-sm text-gray-500 text-center">
                  Searching...
                </div>
              )}
              {!searchLoading && searchResults.length === 0 && !userSearchQuery && (
                <div className="p-4 text-sm text-gray-500 text-center">
                  Start typing to search for users
                </div>
              )}
              {!searchLoading && searchResults.length === 0 && userSearchQuery && (
                <div className="p-4 text-sm text-gray-500 text-center">
                  No users found
                </div>
              )}
              {searchResults.map((user) => {
                const isDeclined = declinedUserIds.has(user.id);
                const isInLeague = leagueMembers.has(user.id);
                const hasPendingInvite = pendingUserIds.has(user.id);

                console.log(`User ${user.username}: pending=${hasPendingInvite}, inLeague=${isInLeague}, declined=${isDeclined}, leagueMembers size=${leagueMembers.size}`);

                let buttonLabel = "Invite";
                let isDisabled = false;
                let buttonVariant: "default" | "outline" = "default";

                if (isDeclined) {
                  buttonLabel = "Declined";
                  isDisabled = true;
                  buttonVariant = "outline";
                } else if (isInLeague) {
                  buttonLabel = "In League";
                  isDisabled = true;
                  buttonVariant = "outline";
                } else if (hasPendingInvite) {
                  buttonLabel = "Pending";
                  isDisabled = true;
                  buttonVariant = "outline";
                } else if (inviteLoading === user.id) {
                  buttonLabel = "Inviting...";
                  isDisabled = true;
                }

                return (
                  <div
                    key={user.id}
                    className="p-3 border-b border-gray-100 last:border-b-0 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-sm truncate">
                          {user.username || "Unknown"}
                        </div>
                        {isDeclined && (
                          <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-red-100 text-red-800">
                            Declined
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 truncate">{user.email}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInviteMember(user.id)}
                      disabled={isDisabled}
                      variant={buttonVariant}
                      className="ml-2 shrink-0"
                    >
                      {buttonLabel}
                    </Button>
                  </div>
                );
              })}
            </>
          )}

          {/* Pending Tab */}
          {activeTab === "pending" && (
            <>
              {pendingInvites.length === 0 && declinedInvites.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  No invites
                </div>
              ) : (
                <>
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.notification_id}
                      className="p-3 border-b border-gray-100 last:border-b-0 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-medium text-sm truncate">
                            {invite.username || "Unknown"}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-gray-100 text-gray-600">
                            Pending
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 truncate">{invite.email}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelInvite(invite.notification_id)}
                        className="ml-2 shrink-0"
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                  {declinedInvites.map((invite) => (
                    <div
                      key={invite.notification_id}
                      className="p-3 border-b border-gray-100 last:border-b-0 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-medium text-sm truncate">
                            {invite.username || "Unknown"}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-red-100 text-red-800">
                            Declined
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 truncate">{invite.email}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
