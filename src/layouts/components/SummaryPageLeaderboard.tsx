import { useState } from "react";
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

export type SummaryLeaderboardEntry = {
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
	entries: SummaryLeaderboardEntry[];
	currentUserId?: string;
	onPortfolioClick?: (portfolioId: number) => void;
};

const ITEMS_PER_PAGE = 10;

export default function SummaryPageLeaderboard({
	entries,
	currentUserId,
	onPortfolioClick,
}: Props) {
	const [currentPage, setCurrentPage] = useState(1);

	const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
	const paginatedEntries = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

	const currentUserRank = currentUserId
		? entries.findIndex((entry) => entry.user_id === currentUserId) + 1
		: null;

	return (
		<section>
			<h2 className="text-lg font-semibold mb-3">Leaderboard</h2>
			{currentUserRank && (
			<div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
				<p className="text-sm font-medium text-green-900">Your Rank: #{currentUserRank}</p>
			</div>
			)}

			<div className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-[100px] px-4">Rank</TableHead>
							<TableHead className="px-4">Member</TableHead>
							<TableHead className="px-4">Final Value & Return</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{entries.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3} className="h-24 text-center">
									No members yet.
								</TableCell>
							</TableRow>
						) : (
							paginatedEntries.map((entry, index) => {
								const absoluteIndex = startIndex + index;
								const isFallbackValue = entry.live_value == null;
								const portfolioValue = calculatePortfolioValue({
									netValue: entry.live_value ?? entry.previous_close_value,
								});

								const isFirstPlace = absoluteIndex === 0;
								const isCurrentUser = currentUserId === entry.user_id;

								const rowClass = isFirstPlace
									? "bg-yellow-100/80 hover:bg-yellow-200/80"
									: isCurrentUser
										? "bg-green-50/60 hover:bg-green-100/60"
										: "";

								return (
									<TableRow
										key={entry.portfolio_id}
										className={`${rowClass} ${onPortfolioClick ? "cursor-pointer" : ""}`}
										onClick={() => onPortfolioClick?.(entry.portfolio_id)}
									>
										<TableCell
											className={`font-bold text-lg px-4 pl-7 ${
												isFirstPlace ? "text-yellow-700" : "text-green-700"
											}`}
										>
											{absoluteIndex + 1}

											<span className="inline-flex w-8 items-end justify-center shrink-0 ml-4">
												{isFirstPlace ? (
													<img
														src="/crown.png"
														alt="Winner crown"
														className="w-6 h-6 translate-y-1.25 object-contain "
													/>
												) : null}
											</span>
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
													previousValue={10000}
													displayAs="percent"
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

			{/* Pagination controls */}
			{entries.length > ITEMS_PER_PAGE && (
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

							{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
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
							})}

							<PaginationItem>
								<PaginationNext
									onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
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

