require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { makePick, autopick } = require('./draftlogic');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json());
const cors = require('cors');
app.use(cors());


// Example: GET /draft/:leagueId
app.get('/draft/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  // Fetch draft state from Supabase
  const { data, error } = await supabase
    .from('Drafts')
    .select('*')
    .eq('league_id', leagueId)
    .single();
  if (error) return res.status(404).json({ error: 'Draft not found' });
  res.json(data);
});

// POST /draft/:leagueId/pick
app.post('/draft/:leagueId/pick', async (req, res) => {
  const { leagueId } = req.params;
  const { portfolioId, stockId, round, pickNumber } = req.body;
  try {
    const result = await makePick({ leagueId, portfolioId, stockId, round, pickNumber });
    res.json(result);
  } catch (err) {
    console.error('Error in /draft/:leagueId/pick:', err); // <--- Add this
    res.status(500).json({ error: err.message });
  }
});

// POST /draft/:leagueId/autopick
app.post('/draft/:leagueId/autopick', async (req, res) => {
  const { leagueId } = req.params;
  try {
    const result = await autopick({ leagueId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Draft server running on port ${PORT}`);
});