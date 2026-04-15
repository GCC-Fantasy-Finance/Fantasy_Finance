require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { makePick, autopick } = require('./draftLogic');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(cors({
  origin: [
    'http://localhost:5173',                    // Local development
    'https://fantasy-finance.vercel.app',        // Production
    'https://fantasy-finance.com',
    'https://www.fantasy-finance.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// =============================
// AUTH MIDDLEWARE
// =============================
const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

const server = http.createServer(app);

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
async function startOrResetDraftTimer(leagueId) {
  console.log("Starting/resetting timer for league", leagueId);

  if (draftTimers[leagueId]) {
    clearTimeout(draftTimers[leagueId]);
  }

  // 🔥 Fetch timer duration from DB
  const { data: draft, error } = await supabase
    .from('Drafts')
    .select('seconds_per_pick')
    .eq('league_id', leagueId)
    .single();

  if (error || !draft) {
    console.error("Failed to fetch draft duration:", error);
    return;
  }

  const pickDurationMs = (draft.seconds_per_pick ?? 60) * 1000;

  draftTimers[leagueId] = setTimeout(async () => {
    console.log(`Timer expired for league ${leagueId}, running autopick`);

    try {
      const result = await autopick({ leagueId });

      if (result?.ended || result?.newState?.is_ended) {
        console.log(`Draft ${leagueId} ended. Stopping timer loop.`);
        clearDraftTimer(leagueId);
        return;
      }

      startOrResetDraftTimer(leagueId);

    } catch (err) {
      console.error('Autopick error:', err);
    }
  }, pickDurationMs);
}

// Make a draft pick
app.post('/draft/:leagueId/pick', verifyAuth, async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const { portfolioId, stockId, round, pickNumber } = req.body;
  const userId = req.user.id;

  // Validate body parameters
  if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
    return res.status(400).json({ error: 'Invalid portfolio ID' });
  }
  if (!Number.isInteger(stockId) || stockId <= 0) {
    return res.status(400).json({ error: 'Invalid stock ID' });
  }
  if (!Number.isInteger(round) || round <= 0) {
    return res.status(400).json({ error: 'Invalid round number' });
  }
  if (!Number.isInteger(pickNumber) || pickNumber < 0) {
    return res.status(400).json({ error: 'Invalid pick number' });
  }

  try {
    const result = await makePick({ leagueId, portfolioId, stockId, round, pickNumber, userId });

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
app.post('/draft/:leagueId/start', verifyAuth, async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const userId = req.user.id;

  try {
    const { data: portfolios } = await supabase
      .from('Portfolios')
      .select('portfolio_id')
      .eq('league_id', leagueId)
      .order('portfolio_id', { ascending: true });

    if (!portfolios || portfolios.length === 0) {
      throw new Error('No portfolios for this league');
    }

    // Verify user is league owner
    const { data: league, error: leagueError } = await supabase
      .from('Leagues')
      .select('owner_id')
      .eq('league_id', leagueId)
      .single();

    if (leagueError || !league) {
      throw new Error('League not found');
    }

    if (league.owner_id !== userId) {
      return res.status(403).json({ error: 'Only league owner can start draft' });
    }

    // Check draft not already started
    const { data: draft, error: draftError } = await supabase
      .from('Drafts')
      .select('is_started')
      .eq('league_id', leagueId)
      .single();

    if (draftError || !draft) {
      throw new Error('Draft not found');
    }

    if (draft.is_started) {
      return res.status(400).json({ error: 'Draft already started' });
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

app.get("/", (req, res) => {
  res.send("Draft server is running");
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Draft server running on port ${PORT}`);
});