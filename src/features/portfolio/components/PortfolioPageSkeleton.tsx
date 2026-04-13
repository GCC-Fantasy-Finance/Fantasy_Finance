export default function PortfolioPageSkeleton() {
  const SKELETON_ROWS = 5;

  return (
    <div className="ff-portfolio-page ff-portfolio-page-skeleton mb-18">
      {/* Summary Box and Chart Grid */}
      <div className="ff-portfolio-summary-grid mb-6 grid grid-cols-1 gap-6">
        {/* Summary Box */}
        <div className="w-full rounded-md border border-gray-300 bg-white px-6 py-5">
          {/* Total Portfolio Value Label */}
          <p className="text-sm text-gray-500">TOTAL PORTFOLIO VALUE</p>

          {/* Value and Ticker Skeletons */}
          <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-3">
            <span className="h-10 w-40 rounded bg-gray-200 animate-pulse" />
            <span className="h-8 w-24 rounded bg-gray-200 animate-pulse" />
          </div>

          {/* Chart and Legend Section */}
          <div className="mt-6 items-center gap-5 flex flex-wrap">
            {/* Pie Chart Skeleton */}
            <div className="h-24 w-24 rounded-full bg-gray-200 animate-pulse" />

            {/* Legend Skeletons */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
                <span className="h-4 w-48 rounded bg-gray-200 animate-pulse" />
              </div>
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
                <span className="h-4 w-48 rounded bg-gray-200 animate-pulse" />
              </div>
            </div>
          </div>

          {/* More Stats Section */}
          <div className="mt-6 flex flex-col items-start gap-x-4 gap-y-3">
            <p className="text-sm text-gray-500">MORE STATS</p>
            <span className="h-8 w-24 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>

      {/* My Stocks Section */}
      <h2 className="mb-2 text-lg font-semibold flex items-center justify-between">
        <span>My Stocks</span>
        <div className="flex gap-4 text-xs font-semibold text-gray-700">
          <span className="w-12 h-4 rounded bg-gray-200 animate-pulse" />
          <span className="w-12 h-4 rounded bg-gray-200 animate-pulse" />
          <span className="w-12 h-4 rounded bg-gray-200 animate-pulse" />
          <span className="w-12 h-4 rounded bg-gray-200 animate-pulse" />
          <span className="w-12 h-4 rounded bg-gray-200 animate-pulse" />
        </div>
      </h2>

      {/* Stock Rows Skeleton */}
      <div className="">
        {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
          <div
            key={index}
            className="grid w-full grid-cols-[20%_minmax(0,200px)_minmax(0,200px)_auto] gap-4 border-x border-t border-gray-300 bg-white px-4 py-4 transition-all hover:bg-gray-50"
            style={{
              borderTopLeftRadius: index === 0 ? "0.5rem" : "0",
              borderTopRightRadius: index === 0 ? "0.5rem" : "0",
              borderBottomLeftRadius:
                index === SKELETON_ROWS - 1 ? "0.5rem" : "0",
              borderBottomRightRadius:
                index === SKELETON_ROWS - 1 ? "0.5rem" : "0",
              borderBottom: index === SKELETON_ROWS - 1 ? "1px solid #d1d5db" : "none",
            }}
          >
            {/* Symbol Column */}
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded bg-gray-200 animate-pulse" />
              <div className="flex flex-col gap-1">
                <span className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
                <span className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
              </div>
            </div>

            {/* Current Price Column */}
            <div className="flex flex-col gap-1">
              <span className="h-3 w-8 rounded bg-gray-200 animate-pulse text-xs" />
              <span className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
            </div>

            {/* You Own Column */}
            <div className="flex flex-col gap-1">
              <span className="h-3 w-8 rounded bg-gray-200 animate-pulse text-xs" />
              <span className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
            </div>

            {/* Actions Column */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="h-8 w-16 rounded bg-gray-200 animate-pulse" />
              <span className="h-8 w-16 rounded bg-gray-200 animate-pulse" />
              <span className="h-8 w-16 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
