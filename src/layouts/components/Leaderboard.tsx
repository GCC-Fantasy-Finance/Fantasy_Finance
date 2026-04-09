import { useMemo, useState } from "react";
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";

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

const ITEMS_PER_PAGE = 20;

function getPortfolioValue(entry: LeaderboardEntry) {
  return calculatePortfolioValue({
    netValue: entry.live_value ?? entry.previous_close_value,
  });
}

function getComparableValueInCents(value: number) {
  return Math.round(value * 100);
}

function getUsername(entry: LeaderboardEntry) {
  return entry.Profiles?.username ?? "Unknown User";
}

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
  const [currentPage, setCurrentPage] = useState(1);

  const rankedEntries = useMemo(() => {
    const entriesWithValues = entries.map((entry) => ({
      entry,
      portfolioValue: getPortfolioValue(entry),
    }));

    // Preserve incoming order except inside ties, where we sort alphabetically.
    const orderedEntries: typeof entriesWithValues = [];
    for (let index = 0; index < entriesWithValues.length; ) {
      const tieValue = getComparableValueInCents(
        entriesWithValues[index].portfolioValue,
      );
      const tieGroup = [entriesWithValues[index]];
      let cursor = index + 1;

      while (cursor < entriesWithValues.length) {
        const cursorValue = getComparableValueInCents(
          entriesWithValues[cursor].portfolioValue,
        );
        if (cursorValue !== tieValue) break;
        tieGroup.push(entriesWithValues[cursor]);
        cursor += 1;
      }

      tieGroup.sort((left, right) =>
        getUsername(left.entry).localeCompare(
          getUsername(right.entry),
          undefined,
          {
            sensitivity: "base",
          },
        ),
      );

      orderedEntries.push(...tieGroup);
      index = cursor;
    }

    let previousRankValue: number | null = null;
    let currentRank = 0;

    return orderedEntries.map((item, index) => {
      const rankValue = getComparableValueInCents(item.portfolioValue);
      if (rankValue !== previousRankValue) {
        currentRank = index + 1;
        previousRankValue = rankValue;
      }

      return {
        ...item,
        rank: currentRank,
      };
    });
  }, [entries]);

  const totalPages = Math.ceil(rankedEntries.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEntries = rankedEntries.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const currentUserRank = currentUserId
    ? (rankedEntries.find((item) => item.entry.user_id === currentUserId)
        ?.rank ?? null)
    : null;
  return (
    <section>
      <div className="flex min-[450px]:flex-row flex-col min-[450px]:items-center mb-2 justify-between">
        <h2 className="text-xl font-semibold mb-2 min-[450px]:mb-0">
          Leaderboard
        </h2>
        {currentUserRank && (
          <div className="bg-green-700/5 py-1 px-3 rounded-md border border-green-700/25 ">
            <p className="text-green-900">
              Your Rank: <span className="font-bold">{currentUserRank}</span>
            </p>
          </div>
        )}
      </div>

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
              paginatedEntries.map(({ entry, portfolioValue, rank }) => {
                const isFallbackValue = entry.live_value == null;
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

      {/* Pagination controls */}
      {rankedEntries.length > ITEMS_PER_PAGE && (
        <div className="mt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="cursor-pointer"
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => {
                  const isEllipsis =
                    (page < currentPage - 1 && page !== 1) ||
                    (page > currentPage + 1 && page !== totalPages);

                  if (isEllipsis && page === 2) {
                    return (
                      <PaginationItem key="ellipsis-start">
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }

                  if (isEllipsis && page === totalPages - 1) {
                    return (
                      <PaginationItem key="ellipsis-end">
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }

                  if (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  ) {
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === currentPage}
                          onClick={() => setCurrentPage(page)}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  }
                },
              )}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="cursor-pointer"
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </section>
  );
}
