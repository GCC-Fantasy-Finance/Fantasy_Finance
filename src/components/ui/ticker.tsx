import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type TickerProps = {
  currentValue: number | null | undefined;
  previousValue: number | null | undefined;
  displayAs?: "percent" | "dollar";
  size?: "large" | "normal" | "small";
  className?: string;
};

function formatDelta(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Ticker({
  currentValue,
  previousValue,
  displayAs = "percent",
  size = "normal",
  className,
}: TickerProps) {
  const current = Number(currentValue ?? 0);
  const previous = Number(previousValue ?? 0);
  const delta = current - previous;
  const percentDelta = previous === 0 ? 0 : (delta / previous) * 100;
  const movementThreshold = 0.01;

  const isUp = delta > movementThreshold;
  const isDown = delta < -movementThreshold;

  const sizeClass =
    size === "large" ? "text-lg" : size === "small" ? "text-xs" : "text-sm";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        sizeClass,
        isUp ? "text-green-700" : isDown ? "text-red-700" : "text-gray-500",
        className,
      )}
      aria-label="Daily change"
    >
      {isUp ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : isDown ? (
        <TrendingDown className="h-3.5 w-3.5" />
      ) : (
        <Minus className="h-3.5 w-3.5" />
      )}
      <span>
        {isUp ? "+" : isDown ? "-" : ""}
        {displayAs === "dollar"
          ? `$${formatDelta(Math.abs(delta))}`
          : `${formatDelta(Math.abs(percentDelta))}%`}
      </span>
    </span>
  );
}
