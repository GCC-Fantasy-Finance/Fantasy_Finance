import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { usePageTitle } from "../../../hooks/usePageTitle";
import PageContent from "../../../layouts/components/PageContent";
import { useAuth } from "@/context/AuthContext";
import {
  withLiveValues,
} from "@/lib/leagues";
import { useStockPrices } from "@/context/StockPriceContext";
import { fetchHomePortfolios, type PortfolioCard } from "@/hooks/fetchHomePortfolios";
import HomePageCard from "@/components/ui/homepagecard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Ticker from "@/components/ui/ticker";
import Spinner from "@/components/ui/spinner";
import { Grid, Rows3 } from "lucide-react";

const HOME_VIEW_MODE_COOKIE = "home_view_mode";

function getSavedHomeViewMode(): "cards" | "table" {
  if (typeof document === "undefined") return "cards";

  const cookieValue = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${HOME_VIEW_MODE_COOKIE}=`))
    ?.split("=")[1];

  return cookieValue === "table" ? "table" : "cards";
}

function saveHomeViewMode(viewMode: "cards" | "table") {
  if (typeof document === "undefined") return;

  const oneYearInSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${HOME_VIEW_MODE_COOKIE}=${viewMode}; path=/; max-age=${oneYearInSeconds}; SameSite=Lax`;
}

function formatPlace(rank?: number | null) {
  if (rank == null) return "Unranked";
  const moduloTen = rank % 10;
  const moduloHundred = rank % 100;

  if (moduloTen === 1 && moduloHundred !== 11) return `${rank}st`;
  if (moduloTen === 2 && moduloHundred !== 12) return `${rank}nd`;
  if (moduloTen === 3 && moduloHundred !== 13) return `${rank}rd`;

  return `${rank}th`;
}

function hasSeenLeagueResultsModal(leagueId?: number | null) {
  if (!leagueId || typeof window === "undefined") return true;
  return Boolean(localStorage.getItem(`league_${leagueId}_seen_modal`));
}

type PortfolioTableProps = {
  portfolios: PortfolioCard[];
  isEndedSection?: boolean;
};

function PortfolioTable({
  portfolios,
  isEndedSection = false,
}: PortfolioTableProps) {
  const navigate = useNavigate();
  const showInvestedReserve = !isEndedSection;

  if (portfolios.length === 0) return null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader className="bg-green-600/10">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 w-[34%]">Name</TableHead>
            <TableHead className="px-4 w-[16%]">Rank</TableHead>
            {showInvestedReserve ? (
              <>
                <TableHead className="px-4 w-[26%]">Net</TableHead>
                <TableHead className="px-4 w-[12%]">Invested</TableHead>
                <TableHead className="px-4 w-[12%]">Reserve</TableHead>
              </>
            ) : (
              <TableHead className="px-4 w-[50%]">Net</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {portfolios.map((portfolio, index) => {
            const netValue = Number(
              portfolio.net_value ?? portfolio.previous_close_value ?? 0,
            );
            const previousValue = Number(
              portfolio.previous_close_value ?? netValue,
            );
            const valueDelta = netValue - previousValue;
            const movementThreshold = 0.01;
            const isUp = valueDelta > movementThreshold;
            const isDown = valueDelta < -movementThreshold;
            const reserveValue = Number(portfolio.reserve_value ?? 0);
            const amountInvested = netValue - reserveValue;
            const isLeagueEnded =
              !portfolio.is_solo && Boolean(portfolio.is_league_ended);
            const hasSeenResultsModal = isLeagueEnded
              ? hasSeenLeagueResultsModal(portfolio.league_id)
              : true;
            const hideEndedResults = isLeagueEnded && !hasSeenResultsModal;

            return (
              <TableRow
                key={portfolio.portfolio_id}
                className={`cursor-pointer ${
                  isLeagueEnded && !hasSeenResultsModal
                    ? "bg-green-600/8 hover:bg-green-600/12"
                    : index % 2 === 1
                      ? "bg-gray-50"
                      : ""
                }`}
                onClick={() => {
                  if (portfolio.is_solo) {
                    navigate("/solo");
                    return;
                  }
                  navigate(`/league/${portfolio.league_id}`);
                }}
              >
                <TableCell
                  className={`px-4 py-3 w-[34%] ${
                    isEndedSection || isLeagueEnded
                      ? "text-gray-700"
                      : isUp
                        ? "text-green-700"
                        : isDown
                          ? "text-red-700"
                          : "text-gray-800"
                  }`}
                  title={portfolio.name}
                >
                  <span className="block truncate font-medium">
                    {portfolio.name}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 w-[16%] ">
                  {hideEndedResults ? null : portfolio.rank == 1 ? (
                    <div className="text-md font-medium flex gap-1.5 items-center text-yellow-600">
                      <img
                        src="/crown.png"
                        alt="Winner crown"
                        className="w-4 h-4 object-contain "
                      />
                      {formatPlace(portfolio.rank)}
                    </div>
                  ) : (
                    <>{formatPlace(portfolio.rank)}</>
                  )}
                </TableCell>
                <TableCell
                  className={`px-4 py-3 tabular-nums ${
                    showInvestedReserve ? "w-[26%]" : "w-[50%]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-medium">
                    {!hideEndedResults ? (
                      <span
                        className={
                          !isEndedSection && !isLeagueEnded
                            ? isUp
                              ? "text-green-700"
                              : isDown
                                ? "text-red-700"
                                : "text-gray-500"
                            : "text-gray-800"
                        }
                      >
                        ${netValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    ) : null}
                    {hideEndedResults ? (
                      <span className="text-green-700 font-medium whitespace-nowrap">
                        View Results <span aria-hidden="true">›</span>
                      </span>
                    ) : null}
                    {!isEndedSection && !isLeagueEnded ? (
                      <Ticker
                        currentValue={netValue}
                        previousValue={previousValue}
                        className="w-[88px] tabular-nums"
                      />
                    ) : null}
                  </div>
                </TableCell>
                {showInvestedReserve ? (
                  <>
                    <TableCell className="px-4 py-3 w-[12%] tabular-nums">
                      {isLeagueEnded ? "-" : `$${amountInvested.toFixed(2)}`}
                    </TableCell>
                    <TableCell className="px-4 py-3 w-[12%] tabular-nums">
                      {isLeagueEnded ? "-" : `$${reserveValue.toFixed(2)}`}
                    </TableCell>
                  </>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Home() {
  usePageTitle("Home");

  const { user } = useAuth();
  const stockPrices = useStockPrices();
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<PortfolioCard[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "table">(() =>
    getSavedHomeViewMode(),
  );

  useEffect(() => {
    saveHomeViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    async function load() {
      if (!user?.id) {
        setPortfolios([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const result = await fetchHomePortfolios(user.id);
        setPortfolios(result.portfolios);
      } catch (err) {
        console.error("Failed to load portfolios:", err);
        setPortfolios([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || portfolios.length === 0) return;

    const refreshValues = async () => {
      try {
        const portfolioIds = portfolios.map((p) => ({
          portfolio_id: p.portfolio_id,
          reserve_value: p.reserve_value ?? 0,
        }));
        const portfoliosWithNet = await withLiveValues(portfolioIds);
        const netValueByPortfolioId = new Map(
          portfoliosWithNet.map((portfolio) => [
            Number(portfolio.portfolio_id),
            Number(portfolio.live_value ?? 0),
          ]),
        );

        setPortfolios((prev) =>
          prev.map((p) => ({
            ...p,
            net_value: netValueByPortfolioId.get(p.portfolio_id) ?? p.net_value,
          })),
        );
      } catch (err) {
        console.error("Failed to refresh portfolio values:", err);
      }
    };

    refreshValues();
  }, [stockPrices, user?.id, portfolios.length]);

  return (
    <PageContent>
      <div className="justify-between flex">
        <h2 className="text-xl font-semibold mb-4">Portfolios</h2>
        <div className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white p-1 h-fit">
          <button
            type="button"
            className={`rounded p-1.5 transition-colors cursor-pointer ${
              viewMode === "cards"
                ? "bg-gray-100 text-black"
                : "text-gray-500 hover:text-black"
            }`}
            aria-label="Card view"
            onClick={() => setViewMode("cards")}
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`rounded p-1.5 transition-colors cursor-pointer  ${
              viewMode === "table"
                ? "bg-gray-100 text-black"
                : "text-gray-500 hover:text-black"
            }`}
            aria-label="Table view"
            onClick={() => setViewMode("table")}
          >
            <Rows3 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12 mb-8">
          <Spinner />
        </div>
      ) : portfolios.length === 0 ? (
        <p className="text-gray-600">No portfolios yet.</p>
      ) : (
        (() => {
          const soloPortfolio = portfolios.find(
            (portfolio) => portfolio.is_solo,
          );
          const leaguePortfolios = portfolios.filter(
            (portfolio) => !portfolio.is_solo,
          );
          const currentLeaguePortfolios = leaguePortfolios.filter(
            (portfolio) => !portfolio.is_league_ended,
          );
          const endedLeaguePortfolios = leaguePortfolios.filter(
            (portfolio) => portfolio.is_league_ended,
          );

          return (
            <div className="flex flex-col gap-8">
              {soloPortfolio ? (
                <div className="w-full space-y-3">
                  <p className="text-sm tracking-wide uppercase text-gray-600">
                    Personal
                  </p>
                  {viewMode === "cards" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      <HomePageCard
                        key={soloPortfolio.portfolio_id}
                        {...soloPortfolio}
                      />
                    </div>
                  ) : (
                    <PortfolioTable portfolios={[soloPortfolio]} />
                  )}
                </div>
              ) : null}

              {currentLeaguePortfolios.length > 0 ? (
                <div className="w-full space-y-3">
                  <p className="text-sm tracking-wide uppercase text-gray-600">
                    Ongoing Leagues
                  </p>
                  {viewMode === "cards" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {currentLeaguePortfolios.map((portfolio) => (
                        <HomePageCard
                          key={portfolio.portfolio_id}
                          {...portfolio}
                        />
                      ))}
                    </div>
                  ) : (
                    <PortfolioTable portfolios={currentLeaguePortfolios} />
                  )}
                </div>
              ) : null}

              {endedLeaguePortfolios.length > 0 ? (
                <div className="w-full space-y-3">
                  <p className="text-sm tracking-wide uppercase text-gray-600">
                    Ended Leagues
                  </p>
                  {viewMode === "cards" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {endedLeaguePortfolios.map((portfolio) => (
                        <HomePageCard
                          key={portfolio.portfolio_id}
                          {...portfolio}
                        />
                      ))}
                    </div>
                  ) : (
                    <PortfolioTable
                      portfolios={endedLeaguePortfolios}
                      isEndedSection
                    />
                  )}
                </div>
              ) : null}

              <div className="h-16" />
            </div>
          );
        })()
      )}
    </PageContent>
  );
}

export default Home;
