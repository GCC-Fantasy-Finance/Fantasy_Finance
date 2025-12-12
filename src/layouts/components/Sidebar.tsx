import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  Compass,
  Home,
  PlusCircle,
  User2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateLeagueModal from "@/components/ui/CreateLeagueModal";
import JoinLeagueModal from "@/components/ui/JoinLeagueModal";
import { supabase } from "@/lib/supabase";


type NavItem = {
  name: string;
  path: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export default function Sidebar() {
  const location = useLocation();
  const { profile } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const leagues: any[] = [];

  // STEP 2 — Fetch each league by ID (super reliable)
  for (const p of portfolios) {
    console.log("Fetching league:", p.league_id);

    const { data: league, error: leagueError } = await supabase
      .from("Leagues")
      .select("*")
      .eq("league_id", p.league_id)
      .maybeSingle();

    console.log("LEAGUE RESULT:", league);
    console.log("LEAGUE ERROR:", leagueError);

    if (!leagueError && league) {
      leagues.push(league);
    }
  }

  console.log("FINAL LEAGUES:", leagues);
  return leagues;
}





  useEffect(() => {
    fetchLeagues()
      .then((data) => setLeagues(data))
      .finally(() => setLoading(false));
  }, [profile]);
  

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }

    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  
  

  return (
    <aside className="w-50 h-screen bg-gray-100 border-r border-gray-300 flex flex-col">
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
      <nav className="flex-1">
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
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.8} />
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
          <Button size="xs" variant="secondary" className="flex-1" onClick={() => setIsJoinOpen(true)}>
            <UserPlus /> Join
          </Button>
        </div>

        {/* Links to League pages */}
        <div className="px-2 mt-2">
          {loading ? (
            <p className="text-xs text-gray-500 px-2 py-1">Loading...</p>
          ) : leagues.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-1">No leagues yet</p>
          ) : (
            <ul className="space-y-1">
  {leagues.map((league) => (
    <li key={league.league_id}>
      <Link
        to={`/league/${league.league_id}`}
        className="block px-4 py-2 rounded hover:bg-gray-200 text-sm"
      >
        {league.name}
      </Link>
    </li>
  ))}
</ul>

          )}
        </div>

        

        <CreateLeagueModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
        <JoinLeagueModal open={isJoinOpen} onClose={() => setIsJoinOpen(false)} />
      </nav>

      {/* User Profile at Bottom */}
      <div className="border-t border-gray-300">
        <Link
          to="/profile"
          className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-gray-300 overflow-hidden">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <User2 className="w-5 h-5 text-gray-500" />
            )}
          </div>
          <span className="text-sm truncate min-w-0">
            {profile?.username || "Username"}
          </span>
        </Link>
      </div>
    </aside>
  );
}
