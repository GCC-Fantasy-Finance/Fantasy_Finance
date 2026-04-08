import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Ticker from "@/components/ui/ticker";
import { calculateStockDelta } from "@/lib/utils";

type PortfolioCard = {
  portfolio_id: number;
  is_solo: boolean;
  league_id?: number | null;
  is_league_ended?: boolean;
  net_value?: number | null;
  previous_close_value?: number | null;
  reserve_value?: number | null;
  name: string;
  rank?: number | null;
};

function formatPlace(rank?: number | null) {
  if (rank == null) return "Unranked";
  const moduloTen = rank % 10;
  const moduloHundred = rank % 100;

  if (moduloTen === 1 && moduloHundred !== 11) return `${rank}st`;
  if (moduloTen === 2 && moduloHundred !== 12) return `${rank}nd`;
  if (moduloTen === 3 && moduloHundred !== 13) return `${rank}rd`;

  return `${rank}th`;
}

export default function HomePageCard(portfolio: PortfolioCard) {
  const navigate = useNavigate();
  const [hasSeenModal, setHasSeenModal] = useState(true);
  
  useEffect(() => {
    // Check if modal has been seen for this league
    if (portfolio.league_id && portfolio.is_league_ended) {
      const hasSeenKey = `league_${portfolio.league_id}_seen_modal`;
      const seen = Boolean(localStorage.getItem(hasSeenKey));
      setHasSeenModal(seen);
    }
  }, [portfolio.league_id, portfolio.is_league_ended]);
  
  const netValue = Number(
    portfolio.net_value ?? portfolio.previous_close_value ?? 0,
  );
  const previousCloseValue = Number(portfolio.previous_close_value ?? 0);
  const baselineValue = previousCloseValue > 0 ? previousCloseValue : netValue;
  const valueDelta = calculateStockDelta(netValue, baselineValue);
  const movementThreshold = 0.01;
  const reserveValue = Number(portfolio.reserve_value ?? 0);
  const amountInvested = netValue - reserveValue;
  const isLeagueEnded =
    !portfolio.is_solo && Boolean(portfolio.is_league_ended);
  const isLeagueUp = valueDelta > movementThreshold;
  const isLeagueDown = valueDelta < -movementThreshold;

  return (
    <button
      className={`group w-full text-left rounded-md p-2 cursor-pointer border 
        ${
          isLeagueEnded
            ? "border-gray-300 bg-white hover:bg-gray-100"
            : isLeagueUp
              ? "border-green-800/10 bg-green-600/8 hover:bg-green-600/12"
              : isLeagueDown
                ? "border-red-800/10 bg-red-600/8 hover:bg-red-600/12"
                : "border-gray-200 bg-gray-100 hover:bg-gray-200"
        }  transition-colors`}
      onClick={() => {
        if (portfolio.is_solo) {
          navigate("/solo");
        } else {
          navigate(`/league/${portfolio.league_id}`);
        }
      }}
    >
      <div className="flex items-center justify-between w-full px-2 pt-1">
        <div className="min-w-0 flex-1 ">
          <span
            className={`block truncate text-lg font-medium ${
              isLeagueEnded
                ? "text-black"
                : isLeagueUp
                  ? "text-green-700"
                  : isLeagueDown
                    ? "text-red-700"
                    : "text-black"
            }`}
            title={portfolio.name}
          >
            {portfolio.name}
          </span>
        </div>
        {!isLeagueEnded ? (
          <span className="shrink-0 text-lg text-black whitespace-nowrap">
            {portfolio.rank != null ? `Rank: ${portfolio.rank}` : "Unranked"}
          </span>
        ) : null}
      </div>
      <div className="w-full mt-3 space-y-3">
        {isLeagueEnded ? (
          <>
            {!hasSeenModal ? (
              <div className="rounded-md px-2 pb-2 flex items-center justify-start transition-colors">
                <div className="text-sm font-medium text-gray-700">
                  View Results <span className="ml-1">›</span>
                </div>
              </div>
            ) : (
              <div className="rounded-md px-2 pb-2 flex items-center justify-between transition-colors">
                {portfolio.rank === 1 ? (
                  <div className="text-sm font-medium flex gap-1.5 items-center text-yellow-600">
                    <img
                      src="/crown.png"
                      alt="Winner crown"
                      className="w-4 h-4 object-contain"
                    />
                    {formatPlace(portfolio.rank)} place
                  </div>
                ) : (
                  <div className="text-sm font-medium text-gray-600">
                    {formatPlace(portfolio.rank)} place
                  </div>
                )}
                <div className="text-sm text-gray-600 uppercase tracking-wide">
                  ${netValue.toFixed(2)}
                </div>
              </div>
            )}
          </>
        ) : null}
        {!isLeagueEnded ? (
          <div className="rounded-md bg-white  px-3 py-3 flex items-center justify-between transition-colors">
            <div className="text-lg text-black">
              ${netValue.toFixed(2)}
              <div className="text-xs text-gray-500 font-normal uppercase tracking-wide">
                Net
              </div>
            </div>

            <div className="text-md font-medium flex items-center justify-center">
              <Ticker
                currentValue={netValue}
                previousValue={baselineValue}
                displayAs="percent"
                size="large"
              />
            </div>
          </div>
        ) : null}
        {!isLeagueEnded ? (
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className=" rounded-md bg-white  px-3 py-1 text-center flex flex-col justify-center transition-colors">
              <div className="text-md text-black">
                ${amountInvested.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                Invested
              </div>
            </div>
            <div className=" rounded-md bg-white  px-3 py-1 text-center flex flex-col justify-center transition-colors">
              <div className="text-md text-black">
                ${reserveValue.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                Reserve
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
}
