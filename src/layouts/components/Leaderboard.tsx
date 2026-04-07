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
};

type RankedLeaderboardEntry = {
  entry: LeaderboardEntry;
  portfolioValue: number;
  rankValue: number;
  username: string;
  rank: number;
};

export default function Leaderboard({
  entries,
  currentUserId,
  onPortfolioClick,
}: Props) {
  const sortedEntries: Array<Omit<RankedLeaderboardEntry, "rank">> = entries
    .map((entry) => {
      const portfolioValue = calculatePortfolioValue({
        netValue: entry.live_value ?? entry.previous_close_value,
      });

      return {
        entry,
        portfolioValue,
        rankValue: Math.round(portfolioValue * 100),
        username: entry.Profiles?.username ?? "Unknown User",
      };
    })
    .sort((a, b) => {
      if (b.rankValue !== a.rankValue) {
        return b.rankValue - a.rankValue;
      }

      const nameSort = a.username.localeCompare(b.username, undefined, {
        sensitivity: "base",
      });

      if (nameSort !== 0) {
        return nameSort;
      }

      return a.entry.portfolio_id - b.entry.portfolio_id;
    });

  const rankedEntries: RankedLeaderboardEntry[] = [];
  for (let index = 0; index < sortedEntries.length; index += 1) {
    const item = sortedEntries[index];
    const previous = rankedEntries[index - 1];
    const rank =
      previous && item.rankValue === previous.rankValue
        ? previous.rank
        : index + 1;

    rankedEntries.push({
      ...item,
      rank,
    });
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Leaderboard</h2>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px] px-4">Rank</TableHead>
              <TableHead className="px-4">Member</TableHead>
              <TableHead className="px-4">Portfolio Value</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rankedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  No members yet.
                </TableCell>
              </TableRow>
            ) : (
              rankedEntries.map(({ entry, portfolioValue, rank }) => {
                const isFallbackValue = entry.live_value == null;

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
                      {rank}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <UserBadgeHover
                        username={entry.Profiles?.username ?? "Unknown User"}
                        avatarUrl={entry.Profiles?.avatar_url}
                        badges={entry.badges}
                        joinedDate={entry.Profiles?.created_at}
                      />
                    </TableCell>

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
                          previousValue={entry.previous_close_value}
                          className="w-24 justify-end tabular-nums"
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
