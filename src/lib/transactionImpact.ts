/**
 * Transaction Impact Analysis
 * 
 * This module calculates the true impact of transactions that occur mid-day,
 * accounting for price changes between transaction time and end-of-day.
 */

export type TransactionRecord = {
  stock_id: number;
  quantity: number;
  transaction_type: "BUY" | "SELL";
  created_at: string;
  price_per_share: number;
  transaction_total?: number;
};

export type HoldingAtTime = {
  stock_id: number;
  quantity: number;
  average_cost_basis: number; // Weighted average cost per share
  total_cost: number; // Total cost basis (quantity * average_cost_basis)
};

export type DayTransactionImpact = {
  stock_id: number;
  transactions_on_day: TransactionRecord[];
  bought_quantity: number;
  sold_quantity: number;
  buy_cost: number; // Total cost of buys
  sell_proceeds: number; // Total proceeds of sells
  avg_buy_price: number;
  avg_sell_price: number;
  final_quantity: number; // Net quantity after day transactions
  realized_gain_loss: number; // Gain/loss on sold positions
  unrealized_gain_loss_component: number; // Portion of gain/loss from unsold
};

/**
 * Calculate the impact of transactions for a given stock on a specific day,
 * accounting for the current price vs transaction prices
 */
export function calculateDayTransactionImpact(
  stock_id: number,
  transactions: TransactionRecord[],
  current_price: number
): DayTransactionImpact {
  const dayTransactions = transactions.filter(t => t.stock_id === stock_id);
  
  let bought_quantity = 0;
  let sold_quantity = 0;
  let buy_cost = 0;
  let sell_proceeds = 0;

  // Separate buys and sells
  for (const tx of dayTransactions) {
    const qty = Number(tx.quantity);
    const price = Number(tx.price_per_share);
    
    if (tx.transaction_type === "BUY") {
      bought_quantity += qty;
      buy_cost += qty * price;
    } else if (tx.transaction_type === "SELL") {
      sold_quantity += qty;
      sell_proceeds += qty * price;
    }
  }

  const final_quantity = bought_quantity - sold_quantity;
  const avg_buy_price = bought_quantity > 0 ? buy_cost / bought_quantity : 0;
  const avg_sell_price = sold_quantity > 0 ? sell_proceeds / sold_quantity : 0;

  // Calculate realized gain/loss (on sold shares)
  // This is: proceeds from sells - cost of shares that were sold
  // For sold shares, we assume they were sold at their average cost basis coming in to the day
  // Then sold at avg_sell_price
  const realized_gain_loss = sold_quantity > 0 
    ? sell_proceeds - (sold_quantity * avg_buy_price) 
    : 0;

  // Calculate unrealized gain/loss component (on remaining shares)
  // This is how much the unsold portion would be worth at current_price vs what we paid
  const unrealized_gain_loss_component = final_quantity > 0
    ? (current_price - avg_buy_price) * final_quantity
    : 0;

  return {
    stock_id,
    transactions_on_day: dayTransactions,
    bought_quantity,
    sold_quantity,
    buy_cost,
    sell_proceeds,
    avg_buy_price,
    avg_sell_price,
    final_quantity,
    realized_gain_loss,
    unrealized_gain_loss_component,
  };
}

/**
 * Calculate portfolio impact for all stocks traded on a given day.
 * Returns the net gain/loss attributable to mid-day transactions.
 */
export function calculateDayPortfolioImpact(
  transactions: TransactionRecord[],
  priceMap: Record<number, number>
): {
  total_realized: number;
  total_unrealized: number;
  total_impact: number;
  by_stock: Record<number, DayTransactionImpact>;
} {
  // Group transactions by stock
  const by_stock_id = new Map<number, TransactionRecord[]>();
  
  for (const tx of transactions) {
    if (!by_stock_id.has(tx.stock_id)) {
      by_stock_id.set(tx.stock_id, []);
    }
    by_stock_id.get(tx.stock_id)!.push(tx);
  }

  let total_realized = 0;
  let total_unrealized = 0;
  const by_stock: Record<number, DayTransactionImpact> = {};

  for (const [stock_id, stockTransactions] of by_stock_id) {
    const current_price = priceMap[stock_id] ?? 0;
    const impact = calculateDayTransactionImpact(stock_id, stockTransactions, current_price);
    
    by_stock[stock_id] = impact;
    total_realized += impact.realized_gain_loss;
    total_unrealized += impact.unrealized_gain_loss_component;
  }

  return {
    total_realized,
    total_unrealized,
    total_impact: total_realized + total_unrealized,
    by_stock,
  };
}

/**
 * Compare the transaction-weighted average price to the end-of-day price
 * to get the day's P&L impact for a position
 */
export function getTransactionDayPnL(
  impact: DayTransactionImpact,
  endOfDayPrice: number
): {
  bought_pnl: number;
  sold_pnl: number;
  total_pnl: number;
  description: string;
} {
  // For bought shares that are still held:
  // P&L = (endOfDayPrice - avg_buy_price) * final_quantity
  const bought_pnl = impact.final_quantity > 0
    ? (endOfDayPrice - impact.avg_buy_price) * impact.final_quantity
    : 0;

  // For sold shares:
  // P&L = (avg_sell_price - avg_buy_price) * sold_quantity
  const sold_pnl = impact.sold_quantity > 0
    ? (impact.avg_sell_price - impact.avg_buy_price) * impact.sold_quantity
    : 0;

  const total_pnl = bought_pnl + sold_pnl;

  let description = "";
  if (impact.bought_quantity > 0 && impact.sold_quantity === 0) {
    description = `Bought ${impact.bought_quantity} @ $${impact.avg_buy_price.toFixed(2)}, now $${endOfDayPrice.toFixed(2)}`;
  } else if (impact.bought_quantity === 0 && impact.sold_quantity > 0) {
    description = `Sold ${impact.sold_quantity} @ $${impact.avg_sell_price.toFixed(2)}`;
  } else if (impact.bought_quantity > 0 && impact.sold_quantity > 0) {
    description = `Bought ${impact.bought_quantity} @ $${impact.avg_buy_price.toFixed(2)}, Sold ${impact.sold_quantity} @ $${impact.avg_sell_price.toFixed(2)}`;
  }

  return {
    bought_pnl,
    sold_pnl,
    total_pnl,
    description,
  };
}

/**
 * Get comparison prices for display purposes
 * Shows what to compare against for this day's transactions
 */
export function getComparisonPrices(
  impact: DayTransactionImpact,
  previousClosePrice: number,
  endOfDayPrice: number
): {
  compare_from: number;
  compare_to: number;
  rationale: string;
} {
  // For stocks that were bought today: compare buy price to end-of-day
  if (impact.bought_quantity > 0 && impact.sold_quantity === 0) {
    return {
      compare_from: impact.avg_buy_price,
      compare_to: endOfDayPrice,
      rationale: "Bought today - comparing buy price to end-of-day price",
    };
  }

  // For stocks that were sold today: compare yesterday's close to sell price
  if (impact.bought_quantity === 0 && impact.sold_quantity > 0) {
    return {
      compare_from: previousClosePrice,
      compare_to: impact.avg_sell_price,
      rationale: "Sold today - comparing yesterday's close to sell price",
    };
  }

  // For mixed transactions: compare yesterday's close to end-of-day
  if (impact.bought_quantity > 0 && impact.sold_quantity > 0) {
    return {
      compare_from: previousClosePrice,
      compare_to: endOfDayPrice,
      rationale: "Mixed buys/sells - comparing yesterday's close to end-of-day",
    };
  }

  // Fallback
  return {
    compare_from: previousClosePrice,
    compare_to: endOfDayPrice,
    rationale: "No transactions",
  };
}

/**
 * Calculate the dollar P&L for a stock on a given day.
 * This accounts for all scenarios and ensures impacts sum to portfolio total.
 * 
 * Logic:
 * - Pure BUY: (endOfDay - avgBuy) * boughtQty
 * - Pure SELL: (avgSell - yesterdayClose) * soldQty  
 * - Mixed: (endOfDay - avgBuy) * netQtyHeld + (avgSell - yesterdayClose) * soldQty
 * - No trades: (endOfDay - yesterdayClose) * currentQtyHeld
 */
export function calculateDollarPnL(
  impact: DayTransactionImpact,
  endOfDayPrice: number,
  previousClosePrice: number,
  currentQuantityHeld: number
): {
  pnl_dollars: number;
  unrealized: number;
  realized: number;
  description: string;
} {
  // Pure buy day: unrealized gain/loss on bought quantity
  if (impact.bought_quantity > 0 && impact.sold_quantity === 0) {
    const unrealized = (endOfDayPrice - impact.avg_buy_price) * impact.bought_quantity;
    return {
      pnl_dollars: unrealized,
      unrealized,
      realized: 0,
      description: `Bought ${impact.bought_quantity} @ $${impact.avg_buy_price.toFixed(2)}`,
    };
  }

  // Pure sell day: realized gain/loss on sold quantity
  if (impact.bought_quantity === 0 && impact.sold_quantity > 0) {
    const realized = (impact.avg_sell_price - previousClosePrice) * impact.sold_quantity;
    return {
      pnl_dollars: realized,
      unrealized: 0,
      realized,
      description: `Sold ${impact.sold_quantity} @ $${impact.avg_sell_price.toFixed(2)}`,
    };
  }

  // Mixed buy/sell day
  if (impact.bought_quantity > 0 && impact.sold_quantity > 0) {
    // Calculate quantities from different sources
    // original_quantity = what we held at start of day
    const original_quantity = impact.final_quantity + impact.sold_quantity - impact.bought_quantity;
    
    // How much of what we currently hold came from original position?
    const qty_from_original_still_held = Math.max(0, original_quantity - impact.sold_quantity);
    
    // How much of what we currently hold is newly bought?
    const qty_newly_bought_still_held = impact.final_quantity - qty_from_original_still_held;
    
    // P&L on originally held shares still held: compare to yesterday's price
    const pnl_original_still_held = (endOfDayPrice - previousClosePrice) * qty_from_original_still_held;
    
    // P&L on originally held shares that were sold: compare sell price to yesterday's price
    const pnl_original_sold = (impact.avg_sell_price - previousClosePrice) * impact.sold_quantity;
    
    // P&L on newly bought shares: compare to buy price
    const pnl_newly_bought = (endOfDayPrice - impact.avg_buy_price) * qty_newly_bought_still_held;
    
    return {
      pnl_dollars: pnl_original_still_held + pnl_original_sold + pnl_newly_bought,
      unrealized: pnl_original_still_held + pnl_newly_bought,
      realized: pnl_original_sold,
      description: `B${impact.bought_quantity.toFixed(0)}@$${impact.avg_buy_price.toFixed(2)}/S${impact.sold_quantity.toFixed(0)}@$${impact.avg_sell_price.toFixed(2)}`,
    };
  }

  // No trades: use yesterday's close vs today's close
  if (currentQuantityHeld > 0) {
    const unrealized = (endOfDayPrice - previousClosePrice) * currentQuantityHeld;
    return {
      pnl_dollars: unrealized,
      unrealized,
      realized: 0,
      description: `Held ${currentQuantityHeld}`,
    };
  }

  return {
    pnl_dollars: 0,
    unrealized: 0,
    realized: 0,
    description: "No position",
  };
}
