type HoldingForValue = {
  quantity?: number | null;
  stock?: {
    current_price?: number | null;
  } | null;
};

type CalculatePortfolioValueParams = {
  holdings?: HoldingForValue[];
  reserveValue?: number | null;
  netValue?: number | null;
};

export function calculateInvestedValue(
  holdings: HoldingForValue[] = [],
): number {
  return holdings.reduce((sum, holding) => {
    const currentPrice = Number(holding.stock?.current_price ?? 0);
    const quantity = Number(holding.quantity ?? 0);
    return sum + currentPrice * quantity;
  }, 0);
}

export function calculatePortfolioValue({
  holdings,
  reserveValue,
  netValue,
}: CalculatePortfolioValueParams): number {
  if (Array.isArray(holdings)) {
    return calculateInvestedValue(holdings) + Number(reserveValue ?? 0);
  }

  return Number(netValue ?? 0);
}
