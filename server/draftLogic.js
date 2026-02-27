const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =============================
// LEAGUE PROCESSING LOCK
// =============================
const leagueLocks = new Map();

function acquireLock(leagueId) {
  if (leagueLocks.get(leagueId)) {
    return false;
  }
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

  if (portfoliosError) {
    console.error('Failed to fetch league portfolios for wishlist cleanup:', portfoliosError);
    return;
  }

  const portfolioIds = portfolios.map(p => p.portfolio_id);
  if (!portfolioIds.length) return;

  const { error: wishlistError } = await supabase
    .from('Wishlist Items')
    .delete()
    .eq('stock_id', stockId)
    .in('portfolio_id', portfolioIds);

  if (wishlistError) {
    console.error('Failed to remove stock from wishlists:', wishlistError);
  } else {
    console.log(`Removed stock ${stockId} from all league wishlists`);
  }
}

// =============================
// Advance draft state
// =============================
async function advanceDraftState(leagueId) {
  const { data: draft, error: draftError } = await supabase
    .from('Drafts')
    .select('*')
    .eq('league_id', leagueId)
    .single();

  if (draftError || !draft) throw new Error('Draft not found');

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

  console.log(
    `Next pick: Portfolio ${portfolios[nextIdx]} | Round ${nextRound}` +
    (isEnded ? ' | DRAFT ENDED' : '')
  );

  return {
    current_pick: nextIdx,
    current_round: nextRound,
    current_portfolio_id: portfolios[nextIdx],
    is_snaking_forward: isSnakingForward,
    is_ended: isEnded,
  };
}

// =============================
// MAKE PICK
// =============================
async function makePick({ leagueId, portfolioId, stockId, round, pickNumber }) {
  if (!acquireLock(leagueId)) {
    throw new Error('makePick called without acquiring league lock');
  }

  try {
    const { data: draft } = await supabase
      .from('Drafts')
      .select('*')
      .eq('league_id', leagueId)
      .single();

    if (draft?.is_ended) {
      console.log(`Draft ${leagueId} already ended.`);
      return { ended: true };
    }

    if (draft.current_portfolio_id !== portfolioId) {
      throw new Error('Not this portfolios turn');
    }

    // Insert pick
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

    console.log(`Pick made: Portfolio ${portfolioId} drafted Stock ${stockId}`);

    await removeStockFromLeagueWishlists(leagueId, stockId);

    const newState = await advanceDraftState(leagueId);

    return { success: true, newState };

  } finally {
    releaseLock(leagueId);
  }
}

// =============================
// AUTOPICK
// =============================
async function autopick({ leagueId }) {

  if (!acquireLock(leagueId)) {
    console.log(`League ${leagueId} busy. Autopick skipped.`);
    return { busy: true };
  }

  try {

    const { data: draft, error: draftError } = await supabase
      .from('Drafts')
      .select('*')
      .eq('league_id', leagueId)
      .single();

    if (draftError || !draft) throw new Error('Draft not found');

    if (draft.is_ended) {
      console.log(`Draft ${leagueId} already ended.`);
      return { ended: true };
    }

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

      console.log(`Draft initialized. First pick: ${currentPortfolioId}`);
    }

    console.log(`Timer expired. Autopicking for Portfolio ${currentPortfolioId}`);

    const { data: wishlist } = await supabase
      .from('Wishlist Items')
      .select('stock_id')
      .eq('portfolio_id', currentPortfolioId)
      .order("rank", { ascending: true });

    let stockId;

    if (wishlist && wishlist.length > 0) {
      stockId = wishlist[0].stock_id;
    } else {
      stockId = await getFirstUndraftedStock(leagueId);
    }

    return await makePick({
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