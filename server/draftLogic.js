const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Helper to get all portfolios for a league, ordered for draft
async function getDraftPortfolios(leagueId) {
  const { data, error } = await supabase
    .from('Portfolios')
    .select('portfolio_id')
    .eq('league_id', leagueId)
    .order('portfolio_id', { ascending: true }); // Adjust order as needed
  if (error) throw error;
  return data.map((p) => p.portfolio_id);
}

// Advance draft state after a pick
async function advanceDraftState(leagueId) {
  // Get current draft state
  const { data: draft, error: draftError } = await supabase
    .from('Drafts')
    .select('*')
    .eq('league_id', leagueId)
    .single();
  if (draftError || !draft) throw new Error('Draft not found');

  const portfolios = await getDraftPortfolios(leagueId);
  const currentIdx = portfolios.indexOf(draft.current_portfolio_id);
  let nextIdx = draft.is_snaking_forward ? currentIdx + 1 : currentIdx - 1;
  let nextRound = draft.current_round;
  let isSnakingForward = draft.is_snaking_forward;

  // Handle round and direction changes (snake draft)
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
      current_pick: nextIdx,
      current_round: nextRound,
      current_portfolio_id: portfolios[nextIdx],
      is_snaking_forward: isSnakingForward,
      is_ended: isEnded,
      timer_start_time: new Date().toISOString(),
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

// Make a draft pick and advance the draft
async function makePick({ leagueId, portfolioId, stockId, round, pickNumber }) {
  // Insert into Draft Picks
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

  // Advance draft state
  const newState = await advanceDraftState(leagueId);

  return { success: true, newState };
}

// Autopick logic
async function autopick({ leagueId }) {
  // 1. Get current draft state
  const { data: draft, error: draftError } = await supabase
    .from('Drafts')
    .select('*')
    .eq('league_id', leagueId)
    .single();
  if (draftError || !draft) throw new Error('Draft not found');

  // 2. Get current portfolio's wishlist
  const { data: wishlist } = await supabase
    .from('Wishlist Items')
    .select('stock_id')
    .eq('portfolio_id', draft.current_portfolio_id);

  let stockId = null;
  if (wishlist && wishlist.length > 0) {
    stockId = wishlist[0].stock_id;
  } else {
    // 3. If wishlist empty, pick a random stock
    const { data: stocks } = await supabase
      .from('Stocks')
      .select('stock_id');
    if (!stocks || stocks.length === 0) throw new Error('No stocks available');
    stockId = stocks[Math.floor(Math.random() * stocks.length)].stock_id;
  }

  // 4. Call makePick with autopicked stock
  return await makePick({
    leagueId,
    portfolioId: draft.current_portfolio_id,
    stockId,
    round: draft.current_round,
    pickNumber: draft.current_pick,
  });
}

module.exports = { makePick, autopick };