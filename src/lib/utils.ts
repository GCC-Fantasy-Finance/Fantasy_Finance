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

const SHARE_QUANTITY_DECIMALS = 8

export function roundShareQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) {
    return 0
  }

  return Number(quantity.toFixed(SHARE_QUANTITY_DECIMALS))
}

export function calculateShareQuantityForAmount(
  amount: number,
  price: number,
): number {
  if (!Number.isFinite(amount) || !Number.isFinite(price) || price <= 0) {
    return 0
  }

  // Calculate base quantity (amount / price)
  let quantity = amount / price
  quantity = roundShareQuantity(quantity)

  // Check the effective amount when displayed (truncated to 2 decimals)
  // This is what will actually show up in the portfolio
  const effectiveAmount = Math.trunc(quantity * price * 100) / 100

  // If there's a gap due to floating point precision, adjust quantity slightly
  // to get the effective amount as close as possible to the requested amount
  if (Math.abs(effectiveAmount - amount) > 0.005) {
    // Try small adjustments to find a better quantity
    let bestQuantity = quantity
    let bestDiff = Math.abs(effectiveAmount - amount)

    // Try incrementing and decrementing by small amounts
    for (let i = 1; i <= 5; i++) {
      const adj = 1e-8 * i
      
      // Try adding
      const q1 = roundShareQuantity(quantity + adj)
      const eff1 = Math.trunc(q1 * price * 100) / 100
      const diff1 = Math.abs(eff1 - amount)
      if (diff1 < bestDiff) {
        bestDiff = diff1
        bestQuantity = q1
      }

      // Try subtracting
      const q2 = roundShareQuantity(Math.max(0, quantity - adj))
      const eff2 = Math.trunc(q2 * price * 100) / 100
      const diff2 = Math.abs(eff2 - amount)
      if (diff2 < bestDiff) {
        bestDiff = diff2
        bestQuantity = q2
      }
    }

    quantity = bestQuantity
  }

  return quantity
}
