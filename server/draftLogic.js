const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =============================
// LEAGUE PROCESSING LOCK (per league)
// =============================
const leagueLocks = new Map();

function acquireLock(leagueId) {
  if (leagueLocks.get(leagueId)) return false;
  leagueLocks.set(leagueId, true);
  return true;
}

function releaseLock(leagueId) {
  leagueLocks.delete(leagueId);
}

// =============================
// Get all portfolios in draft order
// =============================
async function getDraftPortfolios(leagueId) {
  const { data, error } = await supabase
    .from('Portfolios')
    .select('portfolio_id')
    .eq('league_id', leagueId)
    .order('portfolio_id', { ascending: true });

  if (error) throw error;
  return data.map(p => p.portfolio_id);
}

// =============================
// Remove drafted stock from every wishlist in league
// =============================
async function removeStockFromLeagueWishlists(leagueId, stockId) {
  const { data: portfolios, error: portfoliosError } = await supabase
    .from('Portfolios')
    .select('portfolio_id')
    .eq('league_id', leagueId);

  if (portfoliosError) return;

  const portfolioIds = portfolios.map(p => p.portfolio_id);
  if (!portfolioIds.length) return;

  await supabase
    .from('Wishlist Items')
    .delete()
    .eq('stock_id', stockId)
    .in('portfolio_id', portfolioIds);
}

// =============================
// Advance draft state
// =============================
async function advanceDraftState(leagueId) {
  const { data: draft, error } = await supabase
    .from('Drafts')
    .select('*')
    .eq('league_id', leagueId)
    .single();

  if (error || !draft) throw new Error('Draft not found');

  const portfolios = await getDraftPortfolios(leagueId);
  if (!portfolios.length) throw new Error('No portfolios in league');

  let currentIdx = portfolios.indexOf(draft.current_portfolio_id);
  if (currentIdx === -1) currentIdx = 0;

  let nextIdx = draft.is_snaking_forward ? currentIdx + 1 : currentIdx - 1;
  let nextRound = draft.current_round ?? 1;
  let isSnakingForward = draft.is_snaking_forward ?? true;

  if (nextIdx >= portfolios.length) {
    nextIdx = portfolios.length - 1;
    nextRound += 1;
    isSnakingForward = false;
  } else if (nextIdx < 0) {
    nextIdx = 0;
    nextRound += 1;
    isSnakingForward = true;
  }

  const isEnded = nextRound > draft.total_rounds;

  await supabase
    .from('Drafts')
    .update({
      current_pick: isEnded ? null : nextIdx,
      current_round: isEnded ? draft.current_round : nextRound,
      current_portfolio_id: isEnded ? null : portfolios[nextIdx],
      is_snaking_forward: isSnakingForward,
      is_ended: isEnded,
      timer_start_time: isEnded ? null : new Date().toISOString(),
    })
    .eq('league_id', leagueId);

  return {
    current_pick: nextIdx,
    current_round: nextRound,
    current_portfolio_id: portfolios[nextIdx],
    is_snaking_forward: isSnakingForward,
    is_ended: isEnded,
  };
}

// =============================
// MAKE PICK (INTERNAL - NO USER VALIDATION)
// =============================
async function makePickInternal({ leagueId, portfolioId, stockId, round, pickNumber }) {
  const { error: pickError } = await supabase
    .from('Draft Picks')
    .insert({
      draft_id: leagueId,
      portfolio_id: portfolioId,
      transaction_id: null,
      stock_id: stockId,
      round_number: round,
      pick_number: pickNumber,
    });

  if (pickError) throw pickError;

  await removeStockFromLeagueWishlists(leagueId, stockId);

  const newState = await advanceDraftState(leagueId);

  return { success: true, newState };
}

// =============================
// MAKE PICK (WITH LOCKING & VALIDATION)
// =============================
async function makePick({ leagueId, portfolioId, stockId, round, pickNumber, userId }) {
  // Input validation
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    throw new Error('Invalid league ID');
  }
  if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
    throw new Error('Invalid portfolio ID');
  }
  if (!Number.isInteger(stockId) || stockId <= 0) {
    throw new Error('Invalid stock ID');
  }
  if (!userId) {
    throw new Error('User ID required');
  }

  if (!acquireLock(leagueId)) {
    return { busy: true };
  }

  try {
    // Verify portfolio belongs to league
    const { data: portfolio, error: portfolioError } = await supabase
      .from('Portfolios')
      .select('user_id')
      .eq('portfolio_id', portfolioId)
      .eq('league_id', leagueId)
      .single();

    if (portfolioError || !portfolio) {
      throw new Error('Portfolio not found in this league');
    }

    // Verify user owns the portfolio
    if (portfolio.user_id !== userId) {
      throw new Error('You do not own this portfolio');
    }

    // Get current draft state
    const { data: draft } = await supabase
      .from('Drafts')
      .select('*')
      .eq('league_id', leagueId)
      .single();

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (draft.is_ended) {
      return { ended: true };
    }

    // Verify it's the right portfolio's turn
    if (draft.current_portfolio_id !== portfolioId) {
      throw new Error('Not this portfolio\'s turn');
    }

    // Verify stock hasn't been drafted yet
    const { data: existingPick } = await supabase
      .from('Draft Picks')
      .select('stock_id')
      .eq('draft_id', leagueId)
      .eq('stock_id', stockId)
      .single();

    if (existingPick) {
      throw new Error('Stock already drafted');
    }

    // Verify stock exists
    const { data: stock } = await supabase
      .from('Stocks')
      .select('stock_id')
      .eq('stock_id', stockId)
      .single();

    if (!stock) {
      throw new Error('Stock not found');
    }

    return await makePickInternal({ leagueId, portfolioId, stockId, round, pickNumber });
  } finally {
    releaseLock(leagueId);
  }
}

// =============================
// AUTOPICK (LOCKED)
// =============================
async function autopick({ leagueId }) {
  if (!acquireLock(leagueId)) {
    return { busy: true };
  }

  try {
    const { data: draft, error } = await supabase
      .from('Drafts')
      .select('*')
      .eq('league_id', leagueId)
      .single();

    if (error || !draft) throw new Error('Draft not found');
    if (draft.is_ended) return { ended: true };

    let currentPortfolioId = draft.current_portfolio_id;

    if (!currentPortfolioId) {
      const portfolios = await getDraftPortfolios(leagueId);
      if (!portfolios.length) throw new Error('No portfolios found');

      currentPortfolioId = portfolios[0];

      await supabase
        .from('Drafts')
        .update({
          current_portfolio_id: currentPortfolioId,
          current_pick: 0,
          current_round: 1,
          is_snaking_forward: true,
          timer_start_time: new Date().toISOString(),
        })
        .eq('league_id', leagueId);
    }

    const { data: wishlist } = await supabase
      .from('Wishlist Items')
      .select('stock_id')
      .eq('portfolio_id', currentPortfolioId)
      .order('rank', { ascending: true });

    let stockId;

    if (wishlist && wishlist.length > 0) {
      stockId = wishlist[0].stock_id;
    } else {
      stockId = await getFirstUndraftedStock(leagueId);
    }

    return await makePickInternal({
      leagueId,
      portfolioId: currentPortfolioId,
      stockId,
      round: draft.current_round ?? 1,
      pickNumber: draft.current_pick ?? 0,
    });

  } finally {
    releaseLock(leagueId);
  }
}

// =============================
// RPC: GET AUTOPICK STOCK
// =============================
async function getFirstUndraftedStock(leagueId) {
  const { data, error } = await supabase.rpc('get_autopick_stock', {
    p_league_id: leagueId
  });

  if (error) throw error;
  return data;
}

module.exports = { makePick, autopick, acquireLock, releaseLock };