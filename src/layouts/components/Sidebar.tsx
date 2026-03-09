import { Link, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  Compass,
  Home,
  PlusCircle,
  // User2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateLeagueModal from "@/components/ui/CreateLeagueModal";
import JoinLeagueModal from "@/components/ui/JoinLeagueModal";
import { supabase } from "@/lib/supabase";
import { prefetchLeagueView } from "@/hooks/fetchLeagueView";
import { useLayout } from "@/context/LayoutContext";

type NavItem = {
  name: string;
  path: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export default function Sidebar() {
  const location = useLocation();
  const { profile } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen } = useLayout();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // const [error, setError] = useState<string | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const navItems: NavItem[] = [
    { name: "Home", path: "/", icon: Home },
    { name: "Discover", path: "/discover", icon: Compass },
    { name: "Solo", path: "/solo", icon: UserRound },
  ];

  async function fetchLeagues() {
    console.log("PROFILE:", profile);

    if (!profile) {
      console.log("No profile yet");
      return [];
    }

    // STEP 1 — Get user’s portfolios (excluding solo)
    const { data: portfolios, error: portfoliosError } = await supabase
      .from("Portfolios")
      .select("league_id")
      .eq("user_id", profile.id)
      .eq("is_solo", false);

    console.log("PORTFOLIOS:", portfolios);
    console.log("PORTFOLIOS ERROR:", portfoliosError);

    if (portfoliosError || !portfolios) return [];

    const uniqueLeagueIds = [
      ...new Set(portfolios.map((p) => p.league_id).filter((id) => id != null)),
    ];
    if (uniqueLeagueIds.length === 0) return [];

    const { data: leagues, error: leaguesError } = await supabase
      .from("Leagues")
      .select("*")
      .in("league_id", uniqueLeagueIds as number[]);

    console.log("LEAGUES RESULT:", leagues);
    console.log("LEAGUES ERROR:", leaguesError);

    if (leaguesError || !leagues) return [];
    return leagues;
  }

  const reloadLeagues = useCallback(async () => {
    setLoading(true);
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve([]), 5000),
    );

    Promise.race([fetchLeagues(), timeoutPromise])
      .then((data) => setLeagues(data as any[]))
      .catch(() => setLeagues([]))
      .finally(() => setLoading(false));
  }, [profile]);

  useEffect(() => {
    reloadLeagues();
  }, [reloadLeagues]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname, setIsSidebarOpen]);

  useEffect(() => {
    const handleLeaguesUpdated = () => {
      reloadLeagues();
    };

    window.addEventListener("ff:leagues-updated", handleLeaguesUpdated);
    return () => {
      window.removeEventListener("ff:leagues-updated", handleLeaguesUpdated);
    };
  }, [reloadLeagues]);

  useEffect(() => {
    if (leagues.length === 0) return;

    for (const league of leagues) {
      const leagueId = Number(league?.league_id);
      if (Number.isFinite(leagueId)) {
        prefetchLeagueView(leagueId);
      }
    }
  }, [leagues]);

  const handlePrefetchLeague = (leagueId?: number | null) => {
    const numericLeagueId = Number(leagueId);
    if (!Number.isFinite(numericLeagueId)) return;
    prefetchLeagueView(numericLeagueId);
  };

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }

    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar menu"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-50 h-screen bg-gray-100 border-r border-gray-300 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo/Brand */}
        <div className="flex items-center p-4">
          <img
            src="/ff_favicon.png"
            alt="Fantasy Finance Logo"
            className="w-9 h-9 mr-2"
          />
          <h1 className="text-sm font-bold leading-none text-green-700">
            FANTASY
            <br />
            FINANCE
          </h1>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col min-h-0">
          <ul className="">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
                      active
                        ? "bg-gray-200 font-semibold text-green-700"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <Icon
                      className="w-5 h-5"
                      strokeWidth={active ? 2.5 : 1.8}
                    />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 px-4">
            <div className="border-t-2 border-gray-300" />
          </div>

          <h3 className="px-4 text-xs font-semibold text-gray-500">LEAGUES</h3>

          <div className="flex gap-2 px-4 mt-2">
            <Button
              size="xs"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsCreateOpen(true)}
            >
              <PlusCircle /> Create
            </Button>
            <Button
              size="xs"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsJoinOpen(true)}
            >
              <UserPlus /> Join
            </Button>
          </div>

          {/* Links to League pages */}
          <div className="px-2 mt-2 flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-gray-500 px-2 py-1">Loading...</p>
            ) : leagues.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-1">No leagues yet</p>
            ) : (
              <ul className="space-y-1">
                {leagues.map((league) => {
                  const path =
                    league.finish_time &&
                    new Date(league.finish_time) < new Date()
                      ? `/league/${league.league_id}/results`
                      : `/league/${league.league_id}`;
                  const active = isActive(path);
                  return (
                    <li key={league.league_id}>
                      <Link
                        to={path}
                        title={league.name}
                        onMouseEnter={() =>
                          handlePrefetchLeague(league.league_id)
                        }
                        onFocus={() => handlePrefetchLeague(league.league_id)}
                        onTouchStart={() =>
                          handlePrefetchLeague(league.league_id)
                        }
                        className={`block px-4 py-2 rounded text-sm transition-colors ${
                          active
                            ? "bg-green-700/10 font-semibold text-green-700"
                            : "hover:bg-gray-200"
                        }`}
                      >
                        <span className="block truncate">{league.name}</span>
                      </Link>
                    </li>
                  );
                })}
                <li aria-hidden="true" className="h-9" />
              </ul>
            )}
          </div>

          <CreateLeagueModal
            open={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
          />
          <JoinLeagueModal
            open={isJoinOpen}
            onClose={() => setIsJoinOpen(false)}
          />
        </nav>

        {/* User Profile at Bottom */}
        <div className="border-t border-gray-300">
          <Link
            to="/profile"
            className="flex items-center gap-2.5 p-4 hover:bg-gray-50 transition-colors"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm select-none shrink-0">
                {(profile?.username?.[0] ?? "U").toUpperCase()}
              </div>
            )}
            <span className="text-sm truncate min-w-0">
              {profile?.username || "Username"}
            </span>
          </Link>
        </div>
      </aside>
    </>
  );
}
