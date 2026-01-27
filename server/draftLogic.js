const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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
      current_pick: nextIdx,
      current_round: nextRound,
      current_portfolio_id: portfolios[nextIdx],
      is_snaking_forward: isSnakingForward,
      is_ended: isEnded,
      timer_start_time: new Date().toISOString(),
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
    .select('is_ended')
    .eq('league_id', leagueId)
    .single();

  if (draft?.is_ended) {
    console.log(`Draft ${leagueId} already ended. Pick ignored.`);
    return { ended: true };
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

  if (!draft.current_portfolio_id) {
    const portfolios = await getDraftPortfolios(leagueId);
    if (!portfolios.length) throw new Error('No portfolios found for draft');

    await supabase
      .from('Drafts')
      .update({
        current_portfolio_id: portfolios[0],
        current_pick: 0,
        current_round: 1,
        is_snaking_forward: true,
        timer_start_time: new Date().toISOString(),
      })
      .eq('league_id', leagueId);

    console.log(`Draft ${leagueId} initialized. First pick: Portfolio ${portfolios[0]}`);

    draft.current_portfolio_id = portfolios[0];
    draft.current_pick = 0;
    draft.current_round = 1;
  }

  console.log(`Timer expired. Autopicking for Portfolio ${draft.current_portfolio_id}`);

  const pickNumber = draft.current_pick ?? 0;

  const { data: wishlist } = await supabase
    .from('Wishlist Items')
    .select('stock_id')
    .eq('portfolio_id', draft.current_portfolio_id);

  let stockId;
  if (wishlist && wishlist.length > 0) {
    stockId = wishlist[0].stock_id;
  } else {
    stockId = 1;
  }

  return await makePick({
    leagueId,
    portfolioId: draft.current_portfolio_id,
    stockId,
    round: draft.current_round ?? 1,
    pickNumber,
  });
}

module.exports = { makePick, autopick };