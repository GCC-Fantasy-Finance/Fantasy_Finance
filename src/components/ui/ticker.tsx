import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  calculateStockDelta,
  calculateStockPercentChange,
  cn,
} from "@/lib/utils";

type TickerProps = {
  currentValue: number | null | undefined;
  previousValue: number | null | undefined;
  displayAs?: "percent" | "dollar";
  size?: "large" | "normal" | "small";
  background?: boolean;
  dollarAmount?: boolean;
  timeFrame?: string;
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
  background = false,
  dollarAmount = false,
  timeFrame,
  className,
}: TickerProps) {
  const delta = calculateStockDelta(currentValue, previousValue);
  const percentDelta = calculateStockPercentChange(currentValue, previousValue);
  const movementThreshold = 0.01;

  const isUp = delta > movementThreshold;
  const isDown = delta < -movementThreshold;

  const sizeClass =
    size === "large" ? "text-lg" : size === "small" ? "text-xs" : "text-sm";

  const valueClass = cn(
    displayAs === "percent" && background
      ? isUp
        ? "rounded-md bg-green-500/12 px-1"
        : isDown
          ? "rounded-md bg-red-500/12 px-1"
          : "rounded-md bg-gray-500/12 px-1"
      : null,
  );

  const displayTimeFrame = timeFrame === "1D" ? "Today" : timeFrame;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        sizeClass,
        isUp ? "text-green-700" : isDown ? "text-red-700" : "text-gray-500",
        className,
      )}
      aria-label="Daily change"
    >
      <span className={`flex items-center gap-1 px-2 py-1 ${valueClass}`}>
        {isUp ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : isDown ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <Minus className="h-3.5 w-3.5" />
        )}
        {displayAs === "dollar"
          ? `$${formatDelta(Math.abs(delta))}`
          : `${formatDelta(Math.abs(percentDelta))}%`}
      </span>
      {displayAs === "percent" && dollarAmount ? (
        <span className="ml-1">
          {isUp ? "+" : isDown ? "-" : ""}
          {formatDelta(Math.abs(delta))}
        </span>
      ) : null}
      {displayTimeFrame ? (
        <span
          className={cn(
            isUp ? "text-green-700" : isDown ? "text-red-700" : "text-gray-500",
          )}
        >
          {displayTimeFrame}
        </span>
      ) : null}
    </span>
  );
}
