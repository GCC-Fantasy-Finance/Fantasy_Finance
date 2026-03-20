
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Input } from "./input";
import SearchIcon from "./search-icon";
import { Button } from "./button";
import { supabase } from "@/lib/supabase";

type LeagueMember = {
    id: string;
    username?: string;
    email?: string;
};

type Props = {
    open: boolean;
    leagueId?: string;
    ownerId?: string;
    onClose: () => void;
};

export default function KickMember({
    open,
    leagueId,
    ownerId,
    onClose,
}: Props) {
    const modalRef = useRef<HTMLDivElement | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [members, setMembers] = useState<LeagueMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [kickingUserId, setKickingUserId] = useState<string | null>(null);

    const refetchMembers = useCallback(async () => {
        if (!leagueId) return;

        setLoading(true);
        try {
            const { data: portfolioRows, error: portfolioError } = await supabase
                .from("Portfolios")
                .select("user_id")
                .eq("league_id", Number(leagueId));

            if (portfolioError || !portfolioRows) {
                console.error("Failed to fetch league members:", portfolioError);
                setMembers([]);
                return;
            }

            const memberIds = Array.from(
                new Set(
                    portfolioRows
                        .map((row) => (row as { user_id?: string }).user_id)
                        .filter((id): id is string => Boolean(id)),
                ),
            );

            if (memberIds.length === 0) {
                setMembers([]);
                return;
            }

            const { data: profileRows, error: profileError } = await supabase
                .from("Profiles")
                .select("id,username,email")
                .in("id", memberIds);

            if (profileError || !profileRows) {
                console.error("Failed to fetch profile info for league members:", profileError);
                setMembers([]);
                return;
            }

            setMembers(
                (profileRows as Array<{ id: string; username?: string; email?: string }>)
                    .filter((member) => member.id !== ownerId)
                    .sort((a, b) => {
                        const aName = (a.username || a.email || "").toLowerCase();
                        const bName = (b.username || b.email || "").toLowerCase();
                        return aName.localeCompare(bName);
                    }),
            );
        } catch (err) {
            console.error("Failed to fetch league members:", err);
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }, [leagueId]);

    useEffect(() => {
        if (!open) {
            setSearchQuery("");
            setMembers([]);
            setLoading(false);
            setKickingUserId(null);
            return;
        }

        refetchMembers();
    }, [open, refetchMembers]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        const onMouseDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (modalRef.current && !modalRef.current.contains(target)) {
                onClose();
            }
        };

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("mousedown", onMouseDown);

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("mousedown", onMouseDown);
        };
    }, [open, onClose]);

    const filteredMembers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return members;

        return members.filter((member) => {
            const username = member.username?.toLowerCase() ?? "";
            const email = member.email?.toLowerCase() ?? "";
            return username.includes(query) || email.includes(query);
        });
    }, [members, searchQuery]);

    const handleKickMember = async (userId: string) => {
        if (!leagueId) return;

        if (!window.confirm("Are you sure you want to kick this member?")) {
            return;
        }

        setKickingUserId(userId);
        try {
            const { error } = await supabase
                .from("Portfolios")
                .delete()
                .eq("league_id", Number(leagueId))
                .eq("user_id", userId);

            if (error) {
                alert(`Failed to kick member: ${error.message}`);
                return;
            }

            setMembers((prev) => prev.filter((member) => member.id !== userId));
        } catch (err) {
            console.error("Failed to kick member:", err);
            alert("Failed to kick member");
        } finally {
            setKickingUserId(null);
        }
    };

    if (!open) return null;

    const modal = (
        <div className="ff-modal-viewport fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" />

            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-md h-96 rounded bg-white shadow-lg flex flex-col"
            >
                <div className="flex items-center justify-between px-4 py-2  shrink-0">
                    <h2 className="text-lg font-semibold">Kick Member</h2>
                    
                    
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-gray-500 hover:text-gray-700 cursor-pointer"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    
                </div>
                <div className="text-sm text-gray-500 px-4">Note: Kicked members may not rejoin</div>
                

                <div className="px-4 py-3 border-b border-gray-200 sticky top-0 bg-white shrink-0">
                    <div className="relative">
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10">
                            <SearchIcon className="w-4 h-4 text-gray-400" />
                        </div>
                        <Input
                            type="text"
                            placeholder="Search members..."
                            className="pl-8 pr-8"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                aria-label="Clear search"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {loading && (
                        <div className="p-4 text-sm text-gray-500 text-center">Loading members...</div>
                    )}

                    {!loading && filteredMembers.length === 0 && !searchQuery && (
                        <div className="p-4 text-sm text-gray-500 text-center">No members found.</div>
                    )}

                    {!loading && filteredMembers.length === 0 && Boolean(searchQuery) && (
                        <div className="p-4 text-sm text-gray-500 text-center">No members match your search.</div>
                    )}

                    {!loading &&
                        filteredMembers.map((member) => {
                            const isKicking = kickingUserId === member.id;

                            return (
                                <div
                                    key={member.id}
                                    className="p-3 border-b border-gray-100 last:border-b-0 flex items-center justify-between hover:bg-gray-50"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-sm truncate">
                                            {member.username || "Unknown"}
                                        </div>
                                        <div className="text-xs text-gray-600 truncate">{member.email}</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isKicking}
                                        onClick={() => handleKickMember(member.id)}
                                        className="ml-2 shrink-0 border-red-600 text-red-700 hover:bg-red-50 hover:text-red-700"
                                    >
                                        {isKicking ? "Removing..." : "Kick"}
                                    </Button>
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modal, document.body);
}
