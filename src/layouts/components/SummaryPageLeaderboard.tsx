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

export type SummaryLeaderboardEntry = {
	portfolio_id: number;
	previous_close_value: number;
	live_value?: number;
	user_id: string;
	Profiles: {
		username?: string;
		avatar_url?: string;
	} | null;
};

type Props = {
	entries: SummaryLeaderboardEntry[];
	currentUserId?: string;
	onPortfolioClick?: (portfolioId: number) => void;
};

export default function SummaryPageLeaderboard({
	entries,
	currentUserId,
	onPortfolioClick,
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
							<TableHead className="px-4">Portfolio Value</TableHead>
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
							entries.map((entry, index) => {
								const isFallbackValue = entry.live_value == null;
								const portfolioValue = calculatePortfolioValue({
									netValue: entry.live_value ?? entry.previous_close_value,
								});

								const isFirstPlace = index === 0;
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
											{index + 1}

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
											<div className="flex items-center gap-3 w-full text-left">
												
												{entry.Profiles?.avatar_url ? (
													<img
														src={entry.Profiles.avatar_url}
														alt={entry.Profiles.username ?? "User"}
														className="w-8 h-8 rounded-full object-cover"
													/>
												) : (
													<div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm select-none">
														{(entry.Profiles?.username?.[0] ?? "U").toUpperCase()}
													</div>
												)}
												<span className="underline-offset-2 ">
													{entry.Profiles?.username ?? "Unknown User"}
												</span>
											</div>
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

