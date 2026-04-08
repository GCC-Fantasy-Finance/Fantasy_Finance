import { Link, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  ChevronRight,
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
import Ticker from "@/components/ui/ticker";
import ShieldLoadingIcon from "@/components/ui/ShieldLoadingIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import { prefetchLeagueView } from "@/hooks/fetchLeagueView";
import { useLayout } from "@/context/LayoutContext";

type NavItem = {
  name: string;
  path: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type PortfolioLeagueRow = {
  portfolio_id: number;
  league_id: number | null;
  created_at: string | null;
  previous_close_value: number | null;
  reserve_value: number | null;
};

type LeagueRow = {
  league_id: number;
  name: string;
  finish_time?: string | null;
  is_ended?: boolean | null;
};

type LeagueSidebarEntry = LeagueRow & {
  current_value: number;
  previous_close_value: number;
};

type SoloSidebarTicker = {
  current_value: number;
  previous_close_value: number;
};

const SIDEBAR_LEAGUES_REFRESH_MS = 30_000;
let cachedSidebarLeagues: LeagueSidebarEntry[] = [];
let cachedSidebarLeaguesAt = 0;
let cachedSoloTicker: SoloSidebarTicker | null = null;
let cachedSoloTickerAt = 0;

export default function Sidebar() {
  const location = useLocation();
  const { profile } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen } = useLayout();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  // const [error, setError] = useState<string | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [leagues, setLeagues] =
    useState<LeagueSidebarEntry[]>(cachedSidebarLeagues);
  const [soloTicker, setSoloTicker] = useState<SoloSidebarTicker | null>(
    cachedSoloTicker,
  );
  const [loading, setLoading] = useState(cachedSidebarLeagues.length === 0);

  const navItems: NavItem[] = [
    { name: "Home", path: "/", icon: Home },
    { name: "Discover", path: "/discover", icon: Compass },
    { name: "Solo", path: "/solo", icon: UserRound },
  ];

  async function fetchLeagues(): Promise<LeagueSidebarEntry[]> {
    if (!profile) {
      console.log("No profile yet");
      return [];
    }

    const { data: portfolios, error: portfoliosError } = await supabase
      .from("Portfolios")
      .select(
        "portfolio_id, league_id, created_at, previous_close_value, reserve_value",
      )
      .eq("user_id", profile.id)
      .eq("is_solo", false)
      .not("league_id", "is", null)
      .order("created_at", { ascending: false });

    if (portfoliosError || !portfolios) return [];

    const typedPortfolios = portfolios as PortfolioLeagueRow[];
    if (typedPortfolios.length === 0) return [];

    const uniqueLeagueIds: number[] = [];
    const seenLeagueIds = new Set<number>();
    for (const portfolio of typedPortfolios) {
      const leagueId = Number(portfolio.league_id);
      if (!Number.isFinite(leagueId) || seenLeagueIds.has(leagueId)) continue;
      seenLeagueIds.add(leagueId);
      uniqueLeagueIds.push(leagueId);
    }

    if (uniqueLeagueIds.length === 0) return [];

    const { data: leagues, error: leaguesError } = await supabase
      .from("Leagues")
      .select("league_id, name, finish_time, is_ended")
      .in("league_id", uniqueLeagueIds);

    if (leaguesError || !leagues) return [];

    const leagueById = new Map<number, LeagueRow>();
    for (const league of leagues as LeagueRow[]) {
      leagueById.set(Number(league.league_id), league);
    }

    const portfolioIds = typedPortfolios
      .map((portfolio) => Number(portfolio.portfolio_id))
      .filter((portfolioId) => Number.isFinite(portfolioId));

    const { data: holdingsRows } = await supabase
      .from("Portfolio Holdings")
      .select("portfolio_id, stock_id, quantity")
      .in("portfolio_id", portfolioIds);

    const stockIds = Array.from(
      new Set(
        (holdingsRows ?? [])
          .map((holding: any) => Number(holding.stock_id))
          .filter((stockId) => Number.isFinite(stockId)),
      ),
    );

    const stockPricesById = new Map<number, number>();
    if (stockIds.length > 0) {
      const { data: stockRows } = await supabase
        .from("Stocks")
        .select("stock_id, current_price")
        .in("stock_id", stockIds);

      for (const stock of stockRows ?? []) {
        stockPricesById.set(
          Number((stock as any).stock_id),
          Number((stock as any).current_price ?? 0),
        );
      }
    }

    const holdingsByPortfolio = (holdingsRows ?? []).reduce(
      (map, holding: any) => {
        const portfolioId = Number(holding.portfolio_id);
        const existing = map.get(portfolioId) ?? [];
        existing.push({
          quantity: Number(holding.quantity ?? 0),
          stock: {
            current_price: stockPricesById.get(Number(holding.stock_id)) ?? 0,
          },
        });
        map.set(portfolioId, existing);
        return map;
      },
      new Map<
        number,
        Array<{
          quantity?: number | null;
          stock?: { current_price?: number | null };
        }>
      >(),
    );

    const sidebarEntries: LeagueSidebarEntry[] = [];
    const seenSidebarLeagueIds = new Set<number>();

    for (const portfolio of typedPortfolios) {
      const leagueId = Number(portfolio.league_id);
      if (!Number.isFinite(leagueId) || seenSidebarLeagueIds.has(leagueId)) {
        continue;
      }

      const league = leagueById.get(leagueId);
      if (!league) continue;

      const currentValue = calculatePortfolioValue({
        holdings: holdingsByPortfolio.get(Number(portfolio.portfolio_id)) ?? [],
        reserveValue: portfolio.reserve_value,
      });

      sidebarEntries.push({
        ...league,
        current_value: currentValue,
        previous_close_value: Number(portfolio.previous_close_value ?? 0),
      });
      seenSidebarLeagueIds.add(leagueId);
    }

    return sidebarEntries;
  }

  async function fetchSoloTicker(): Promise<SoloSidebarTicker | null> {
    if (!profile) return null;

    const { data: soloPortfolio, error: soloPortfolioError } = await supabase
      .from("Portfolios")
      .select("portfolio_id, previous_close_value, reserve_value, created_at")
      .eq("user_id", profile.id)
      .eq("is_solo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (soloPortfolioError || !soloPortfolio) return null;

    const portfolioId = Number(
      (soloPortfolio as PortfolioLeagueRow).portfolio_id,
    );
    if (!Number.isFinite(portfolioId)) return null;

    const { data: holdingsRows } = await supabase
      .from("Portfolio Holdings")
      .select("portfolio_id, stock_id, quantity")
      .eq("portfolio_id", portfolioId);

    const stockIds = Array.from(
      new Set(
        (holdingsRows ?? [])
          .map((holding: any) => Number(holding.stock_id))
          .filter((stockId) => Number.isFinite(stockId)),
      ),
    );

    const stockPricesById = new Map<number, number>();
    if (stockIds.length > 0) {
      const { data: stockRows } = await supabase
        .from("Stocks")
        .select("stock_id, current_price")
        .in("stock_id", stockIds);

      for (const stock of stockRows ?? []) {
        stockPricesById.set(
          Number((stock as any).stock_id),
          Number((stock as any).current_price ?? 0),
        );
      }
    }

    const holdings = (holdingsRows ?? []).map((holding: any) => ({
      quantity: Number(holding.quantity ?? 0),
      stock: {
        current_price: stockPricesById.get(Number(holding.stock_id)) ?? 0,
      },
    }));

    const currentValue = calculatePortfolioValue({
      holdings,
      reserveValue: Number(
        (soloPortfolio as PortfolioLeagueRow).reserve_value ?? 0,
      ),
    });

    return {
      current_value: currentValue,
      previous_close_value: Number(
        (soloPortfolio as PortfolioLeagueRow).previous_close_value ?? 0,
      ),
    };
  }

  const reloadLeagues = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent && leagues.length === 0) {
        setLoading(true);
      }

      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve("__timeout__"), 5000),
      );

      Promise.race([fetchLeagues(), timeoutPromise])
        .then((data) => {
          if (data === "__timeout__") return;
          const nextLeagues = data as LeagueSidebarEntry[];
          setLeagues(nextLeagues);
          cachedSidebarLeagues = nextLeagues;
          cachedSidebarLeaguesAt = Date.now();
        })
        .catch(() => {
          if (leagues.length === 0) {
            setLeagues([]);
          }
        })
        .finally(() => {
          if (!silent || leagues.length === 0) {
            setLoading(false);
          }
        });
    },
    [leagues.length, profile],
  );

  const reloadSoloTicker = useCallback(async () => {
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve("__timeout__"), 5000),
    );

    Promise.race([fetchSoloTicker(), timeoutPromise])
      .then((data) => {
        if (data === "__timeout__") return;
        const nextSoloTicker = data as SoloSidebarTicker | null;
        setSoloTicker(nextSoloTicker);
        cachedSoloTicker = nextSoloTicker;
        cachedSoloTickerAt = Date.now();
      })
      .catch(() => {
        // Keep existing ticker value if refresh fails.
      });
  }, [profile]);

  useEffect(() => {
    const hasRecentLeagueCache =
      cachedSidebarLeagues.length > 0 &&
      Date.now() - cachedSidebarLeaguesAt < SIDEBAR_LEAGUES_REFRESH_MS;

    const hasRecentSoloCache =
      cachedSoloTicker !== null &&
      Date.now() - cachedSoloTickerAt < SIDEBAR_LEAGUES_REFRESH_MS;

    if (hasRecentLeagueCache) {
      setLeagues(cachedSidebarLeagues);
      setLoading(false);
    } else {
      void reloadLeagues({ silent: leagues.length > 0 });
    }

    if (hasRecentSoloCache) {
      setSoloTicker(cachedSoloTicker);
    } else {
      void reloadSoloTicker();
    }
  }, [leagues.length, reloadLeagues, reloadSoloTicker]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reloadLeagues({ silent: true });
      void reloadSoloTicker();
    }, SIDEBAR_LEAGUES_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reloadLeagues({ silent: true });
        void reloadSoloTicker();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reloadLeagues, reloadSoloTicker]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname, setIsSidebarOpen]);

  useEffect(() => {
    const handleLeaguesUpdated = () => {
      void reloadLeagues({ silent: true });
      void reloadSoloTicker();
    };

    window.addEventListener("ff:leagues-updated", handleLeaguesUpdated);
    return () => {
      window.removeEventListener("ff:leagues-updated", handleLeaguesUpdated);
    };
  }, [reloadLeagues, reloadSoloTicker]);

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

  const isLeagueEnded = (league: LeagueSidebarEntry) => {
    if (league.is_ended) return true;
    return Boolean(
      league.finish_time && new Date(league.finish_time) < new Date(),
    );
  };

  const ongoingLeagues = leagues.filter((league) => !isLeagueEnded(league));
  const endedLeagues = leagues.filter((league) => isLeagueEnded(league));

  const soloBaselineValue =
    soloTicker && soloTicker.previous_close_value > 0
      ? soloTicker.previous_close_value
      : (soloTicker?.current_value ?? 0);

  const shouldShowSoloTicker =
    soloTicker !== null &&
    Math.abs(soloTicker.current_value - soloBaselineValue) > 0;

  const getLeaguePath = (league: LeagueSidebarEntry) =>
    isLeagueEnded(league)
      ? `/league/${league.league_id}/results`
      : `/league/${league.league_id}`;

  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar menu"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/30 z-50 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 h-screen bg-gray-100 border-r border-gray-300 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo/Brand */}
        <Link
          to="/"
          aria-label="Go to home page"
          className="flex items-center p-4  h-14 w-min"
          onMouseEnter={() => setIsLogoHovered(true)}
          onMouseLeave={() => setIsLogoHovered(false)}
        >
          <div className="relative w-6 h-6 mr-2">
            <img
              src="/ff_favicon.png"
              alt="Fantasy Finance Logo"
              className={`w-6 h-6 absolute transition-opacity duration-200 ${
                isLogoHovered ? "opacity-0" : "opacity-100"
              }`}
            />
            <div
              className={`w-6 h-6 absolute transition-opacity duration-200 ${
                isLogoHovered ? "opacity-100" : "opacity-0"
              }`}
            >
              <ShieldLoadingIcon />
            </div>
          </div>
          <h1 className="text-sm font-semibold -leading-1 text-green-700 text-nowrap">
            FANTASY FINANCE
          </h1>
        </Link>

        {/* Navigation Links */}
        <nav
          className="flex-1 flex flex-col min-h-0"
          aria-label="Sidebar navigation"
        >
          <ul className="">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              const isSoloItem = item.path === "/solo";

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center justify-between gap-2 px-4 py-2 transition-colors ${
                      active
                        ? "bg-gray-200 font-semibold text-green-700"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon
                        className="w-5 h-5"
                        strokeWidth={active ? 2.5 : 1.8}
                      />
                      <span>{item.name}</span>
                    </span>
                    {isSoloItem && shouldShowSoloTicker ? (
                      <Ticker
                        currentValue={soloTicker.current_value}
                        previousValue={soloBaselineValue}
                        displayAs="percent"
                        size="small"
                        className="shrink-0"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-3">
            <div className="border-t-[1.5px] border-gray-300" />
          </div>

          <h2 className="px-4 text-xs font-medium text-gray-500">LEAGUES</h2>

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
          <div className="px-2 mt-2 flex-1 min-h-0 overflow-y-auto chatbot-scroll">
            {loading ? (
              <p className="text-xs text-gray-500 px-2 py-1">Loading...</p>
            ) : leagues.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-1">No leagues yet</p>
            ) : (
              <ul className="space-y-1">
                {ongoingLeagues.map((league) => {
                  const path = getLeaguePath(league);
                  const active = isActive(path);
                  const baselineValue =
                    league.previous_close_value > 0
                      ? league.previous_close_value
                      : league.current_value;
                  const shouldShowTicker =
                    Math.abs(league.current_value - baselineValue) > 0;
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
                        className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                          active
                            ? "bg-green-700/10 font-semibold text-green-700"
                            : "hover:bg-gray-200"
                        }`}
                      >
                        <span className="block truncate min-w-0">
                          {league.name}
                        </span>
                        {shouldShowTicker ? (
                          <Ticker
                            currentValue={league.current_value}
                            previousValue={baselineValue}
                            displayAs="percent"
                            size="small"
                            className="shrink-0"
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
                {endedLeagues.length > 0 ? (
                  <li>
                    <div className="my-2 px-3">
                      <div className="border-t-[1.5px] border-gray-300" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="View ended leagues"
                          className="cursor-pointer text-gray-700 font-medium w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded text-sm transition-colors hover:bg-gray-200"
                        >
                          <span className="block truncate min-w-0 ">
                            Ended Leagues
                          </span>
                          <ChevronRight className="w-4 h-4 shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="right"
                        align="start"
                        className="w-56 "
                      >
                        {endedLeagues.map((league) => {
                          const path = getLeaguePath(league);
                          const active = isActive(path);
                          return (
                            <DropdownMenuItem
                              key={league.league_id}
                              asChild
                              className={
                                active
                                  ? "bg-green-700/10 text-green-700 font-medium cursor-pointer"
                                  : "cursor-pointer"
                              }
                            >
                              <Link
                                to={path}
                                title={league.name}
                                onMouseEnter={() =>
                                  handlePrefetchLeague(league.league_id)
                                }
                                onFocus={() =>
                                  handlePrefetchLeague(league.league_id)
                                }
                                onTouchStart={() =>
                                  handlePrefetchLeague(league.league_id)
                                }
                                className="block w-full truncate"
                              >
                                {league.name}
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ) : null}
                <li aria-hidden="true" className="h-6" />
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
            className="flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 transition-colors"
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
