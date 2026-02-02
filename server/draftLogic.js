const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Get all portfolios in draft order
async function getDraftPortfolios(leagueId) {
  const { data, error } = await supabase
    .from('Portfolios')
    .select('portfolio_id')
    .eq('league_id', leagueId)
    .order('portfolio_id', { ascending: true });

  if (error) throw error;
  return data.map(p => p.portfolio_id);
}

// Remove drafted stock from every wishlist in the league
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

// Advance draft state after a pick
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

// Make a pick
async function makePick({ leagueId, portfolioId, stockId, round, pickNumber }) {
  const { data: draft } = await supabase
    .from('Drafts')
    .select('*')
    .eq('league_id', leagueId)
    .single();

  if (draft?.is_ended) {
    console.log(`Draft ${leagueId} already ended. Pick ignored.`);
    return { ended: true };
  }

  if (draft.current_portfolio_id !== portfolioId) {
    throw new Error('Not this portfolio’s turn');
  }

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

  // Add to holdings
  const { data: stock } = await supabase
    .from('Stocks')
    .select('current_price')
    .eq('stock_id', stockId)
    .single();

  await supabase.from('Portfolio_Holdings').insert({
    portfolio_id: portfolioId,
    stock_id: stockId,
    quantity: 1,
    average_buy_price: stock?.current_price ?? 0,
  });

  // Remove from all wishlists in the league
  await removeStockFromLeagueWishlists(leagueId, stockId);

  const newState = await advanceDraftState(leagueId);
  return { success: true, newState };
}

// Autopick when timer expires
async function autopick({ leagueId }) {
  const { data: draft, error: draftError } = await supabase
    .from('Drafts')
    .select('*')
    .eq('league_id', leagueId)
    .single();

  if (draftError || !draft) throw new Error('Draft not found');

  if (draft.is_ended) {
    console.log(`Draft ${leagueId} already ended. Autopick stopped.`);
    return { ended: true };
  }

  let currentPortfolioId = draft.current_portfolio_id;

  if (!currentPortfolioId) {
    const portfolios = await getDraftPortfolios(leagueId);
    if (!portfolios.length) throw new Error('No portfolios found for draft');

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

    console.log(`Draft ${leagueId} initialized. First pick: Portfolio ${currentPortfolioId}`);
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
    console.log('Wishlist empty, selecting best available undrafted stock');
    stockId = await getFirstUndraftedStock(leagueId);
  }


  return await makePick({
    leagueId,
    portfolioId: currentPortfolioId,
    stockId,
    round: draft.current_round ?? 1,
    pickNumber: draft.current_pick ?? 0,
  });
}

// Get first stock not yet drafted in this league
async function getFirstUndraftedStock(leagueId) {
  // 1. Get all stock_ids already picked in this draft
  const { data: picked, error: pickedError } = await supabase
    .from('Draft Picks')
    .select('stock_id')
    .eq('draft_id', leagueId);

  if (pickedError) throw pickedError;

  const pickedIds = picked.map(p => p.stock_id);

  // 2. Find a stock NOT in that list
  let query = supabase
    .from('Stocks')
    .select('stock_id')
    .order('stock_id', { ascending: true })
    .limit(1);

  if (pickedIds.length > 0) {
    query = query.not('stock_id', 'in', `(${pickedIds.join(',')})`);
  }

  const { data: stock, error: stockError } = await query.single();

  if (stockError || !stock) {
    throw new Error('No undrafted stocks remaining');
  }

  return stock.stock_id;
}

module.exports = { makePick, autopick };