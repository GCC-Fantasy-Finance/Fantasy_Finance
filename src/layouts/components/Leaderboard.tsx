import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Ticker from "@/components/ui/ticker";
import { calculatePortfolioValue } from "@/lib/portfolioValue";
import UserBadgeHover from "@/components/ui/UserBadgeHover";
import type { UserBadgeView } from "@/lib/userBadges";

export type LeaderboardEntry = {
  portfolio_id: number;
  previous_close_value: number;
  live_value?: number;
  created_at?: string | null;
  user_id: string;
  Profiles: {
    username?: string;
    avatar_url?: string;
    created_at?: string;
  } | null;
  badges?: UserBadgeView[];
};

type Props = {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  onPortfolioClick?: (portfolioId: number) => void;
  showDateStarted?: boolean;
  valueColumnLabel?: string;
  tickerPreviousValuesByPortfolioId?: Record<number, number>;
};

function formatDateStarted(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Leaderboard({
  entries,
  currentUserId,
  onPortfolioClick,
  showDateStarted = false,
  valueColumnLabel = "Portfolio Value",
  tickerPreviousValuesByPortfolioId,
}: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Leaderboard</h2>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px] px-4">Rank</TableHead>
              <TableHead className="px-4">Member</TableHead>
              {showDateStarted && (
                <TableHead className="px-4">Date Started</TableHead>
              )}
              <TableHead className="px-4">{valueColumnLabel}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showDateStarted ? 4 : 3}
                  className="h-24 text-center"
                >
                  No members yet.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry, index) => {
                const isFallbackValue = entry.live_value == null;
                const portfolioValue = calculatePortfolioValue({
                  netValue: entry.live_value ?? entry.previous_close_value,
                });
                const tickerPreviousValue =
                  tickerPreviousValuesByPortfolioId?.[entry.portfolio_id] ??
                  entry.previous_close_value;

                return (
                  <TableRow
                    key={entry.portfolio_id}
                    onClick={() => onPortfolioClick?.(entry.portfolio_id)}
                    className={`${
                      currentUserId === entry.user_id
                        ? "bg-green-50/60 hover:bg-green-100/60 font-semibold"
                        : ""
                    } ${onPortfolioClick ? "cursor-pointer" : ""}`}
                  >
                    <TableCell className="font-bold text-lg px-4 pl-7 text-green-700">
                      {index + 1}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <UserBadgeHover
                        username={entry.Profiles?.username ?? "Unknown User"}
                        avatarUrl={entry.Profiles?.avatar_url}
                        badges={entry.badges}
                        joinedDate={entry.Profiles?.created_at}
                      />
                    </TableCell>

                    {showDateStarted && (
                      <TableCell className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {formatDateStarted(entry.created_at)}
                      </TableCell>
                    )}

                    <TableCell
                      className={`px-4 ${isFallbackValue ? "text-gray-500" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-6 w-full">
                        <span className="tabular-nums">
                          $
                          {portfolioValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <Ticker
                          currentValue={portfolioValue}
                          previousValue={tickerPreviousValue}
                          className="w-[96px] justify-end tabular-nums"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
