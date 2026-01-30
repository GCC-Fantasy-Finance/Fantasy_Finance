require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { makePick, autopick } = require('./draftlogic');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const PICK_DURATION = 10 * 1000; // 10 seconds
const draftTimers = {}; // { [leagueId]: Timeout }

// Clear timer helper
function clearDraftTimer(leagueId) {
  if (draftTimers[leagueId]) {
    clearTimeout(draftTimers[leagueId]);
    delete draftTimers[leagueId];
    console.log(`Timer cleared for league ${leagueId}`);
  }
}

// Start or reset the timer for a league
function startOrResetDraftTimer(leagueId) {
  console.log("Starting/reseting timer for league", leagueId); // ADD THIS

  if (draftTimers[leagueId]) clearTimeout(draftTimers[leagueId]);

  draftTimers[leagueId] = setTimeout(async () => {
    console.log(`Timer expired for league ${leagueId}, running autopick`);

    try {
      const result = await autopick({ leagueId });
      console.log('Autopick success:', result.success);

      // STOP if draft is finished
      if (result?.ended || result?.newState?.is_ended) {
        console.log(`Draft ${leagueId} ended. Stopping timer loop.`);
        clearDraftTimer(leagueId);
        return;
      }

      // Otherwise continue timer for next pick
      startOrResetDraftTimer(leagueId);

    } catch (err) {
      console.error('Autopick error:', err);
    }
  }, PICK_DURATION);
}

// Make a draft pick
app.post('/draft/:leagueId/pick', async (req, res) => {
  const { leagueId } = req.params;
  const { portfolioId, stockId, round, pickNumber } = req.body;

  try {
    const result = await makePick({ leagueId, portfolioId, stockId, round, pickNumber });

    // Stop timers if draft ended
    if (result?.ended || result?.newState?.is_ended) {
      clearDraftTimer(leagueId);
    } else {
      startOrResetDraftTimer(leagueId);
    }

    res.json(result);
  } catch (err) {
    console.error('Error in /draft/:leagueId/pick:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start draft
app.post('/draft/:leagueId/start', async (req, res) => {
  const { leagueId } = req.params;

  try {
    const { data: portfolios } = await supabase
      .from('Portfolios')
      .select('portfolio_id')
      .eq('league_id', leagueId)
      .order('portfolio_id', { ascending: true });

    if (!portfolios || portfolios.length === 0) {
      throw new Error('No portfolios for this league');
    }

    await supabase.from('Drafts')
      .update({
        is_started: true,
        is_ended: false,
        current_portfolio_id: portfolios[0].portfolio_id,
        current_pick: 0,
        current_round: 1,
        is_snaking_forward: true,
        timer_start_time: new Date().toISOString(),
      })
      .eq('league_id', leagueId);

    console.log(`Draft ${leagueId} started. First portfolio: ${portfolios[0].portfolio_id}`);

    startOrResetDraftTimer(leagueId);

    res.json({ success: true, current_portfolio_id: portfolios[0].portfolio_id });
  } catch (err) {
    console.error('Failed to start draft:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Draft server running on port ${PORT}`);
});