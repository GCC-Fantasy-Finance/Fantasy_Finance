import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  showDateStarted?: boolean;
  showTimeFrameSelector?: boolean;
  timeFrameOptions?: Array<{ value: string; label: string }>;
};

export default function LeaderboardSkeleton({
  showDateStarted = false,
  showTimeFrameSelector = false,
  timeFrameOptions = [],
}: Props) {
  const SKELETON_ROWS = 10;

  return (
    <section>
      {showTimeFrameSelector && (
        <div className="flex items-center justify-start gap-2 pb-2 mb-2">
          {timeFrameOptions.map((option, index) => (
            <span key={option.value} className="flex items-center gap-2">
              <div className="w-10 h-6 bg-gray-200 rounded animate-pulse" />
              {index < timeFrameOptions.length - 1 && (
                <span className="h-5 w-px bg-gray-300" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>
      )}

      <h2 className="text-xl font-semibold mb-3">Leaderboard</h2>

      <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
        <p className="text-sm font-medium text-green-900">
          <span className="inline-block h-4 w-24 bg-green-200 rounded animate-pulse" />
        </p>
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
              <TableHead className="px-4">Portfolio Value</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
              <TableRow key={index} className="opacity-50">
                {/* Rank Cell */}
                <TableCell className="font-bold text-lg px-4 pl-7">
                  <span className="inline-block h-4 w-6 rounded bg-gray-200 animate-pulse" />
                </TableCell>

                {/* Member Cell */}
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-block h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
                    <span className="inline-block h-4 w-32 rounded bg-gray-200 animate-pulse" />
                  </div>
                </TableCell>

                {/* Date Started Cell (if shown) */}
                {showDateStarted && (
                  <TableCell className="px-4 py-3">
                    <span className="inline-block h-4 w-24 rounded bg-gray-200 animate-pulse" />
                  </TableCell>
                )}

                {/* Portfolio Value Cell */}
                <TableCell className="px-4">
                  <div className="flex items-center justify-between gap-6">
                    <span className="inline-block h-4 w-24 rounded bg-gray-200 animate-pulse" />
                    <span className="inline-block h-4 w-20 rounded bg-gray-200 animate-pulse" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
