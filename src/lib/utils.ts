import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
