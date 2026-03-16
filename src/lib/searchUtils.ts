/**
 * Scores a stock search result to determine ranking priority
 * Prioritizes exact matches and prefix matches over substring matches
 */
export function getSearchScore(
  stock: { stock_symbol?: string; name?: string },
  query: string,
): number {
  const queryLower = query.toLowerCase();
  const symbolLower = stock.stock_symbol?.toLowerCase() || "";
  const nameLower = stock.name?.toLowerCase() || "";

  let score = 0;

  // Exact match on symbol (highest priority)
  if (symbolLower === queryLower) {
    score += 10000;
  }
  // Symbol starts with query (very high priority)
  else if (symbolLower.startsWith(queryLower)) {
    score += 1000;
  }
  // Symbol contains query
  else if (symbolLower.includes(queryLower)) {
    score += 100;
  }

  // Exact match on name
  if (nameLower === queryLower) {
    score += 5000;
  }
  // Name starts with query (high priority)
  else if (nameLower.startsWith(queryLower)) {
    score += 500;
  }
  // Name contains query
  else if (nameLower.includes(queryLower)) {
    score += 50;
  }

  return score;
}
