import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Truncate a number to 2 decimal places (no rounding) and return a formatted string.
 * e.g. 5.006 → "5.00", 9.999 → "9.99"
 */
export function truncateCurrency(value: number): string {
  const truncated = Math.trunc(value * 100) / 100;
  return truncated.toFixed(2);
}

export function calculateStockDelta(
  currentValue: number | null | undefined,
  previousValue: number | null | undefined,
) {
  const current = Number(currentValue ?? 0)
  const previous = Number(previousValue ?? 0)

  return current - previous
}

export function calculateStockPercentChange(
  currentValue: number | null | undefined,
  previousValue: number | null | undefined,
) {
  const previous = Number(previousValue ?? 0)
  const delta = calculateStockDelta(currentValue, previousValue)

  if (previous === 0) {
    return 0
  }

  return (delta / previous) * 100
}
