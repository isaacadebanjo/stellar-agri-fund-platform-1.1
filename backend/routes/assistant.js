import { Router } from 'express';
import { asyncH } from './_async.js';
import { requireRole } from '../middleware/auth.js';
import { getSnapshot } from '../services/metricsSnapshot.js';
import { answerQuestion, assistantStatus, SUGGESTED_PROMPTS } from '../services/assistant.js';
import { nonEmptyString } from '../services/validate.js';

// Investment Committee Assistant. Admin-only — it exposes platform-wide
// analytics. Deterministic by default; optionally enhanced by Anthropic when
// ANTHROPIC_API_KEY is configured (see services/assistant.js).
const r = Router();
r.use(requireRole('admin'));

// Capabilities + suggested prompts for the UI (also reveals whether the optional
// LLM enhancement is active).
r.get('/status', asyncH(async (req, res) => {
  res.json({ ...assistantStatus(), prompts: SUGGESTED_PROMPTS });
}));

// POST /api/assistant/query  { prompt, enhance? }
r.post('/query', asyncH(async (req, res) => {
  const prompt = nonEmptyString(req.body?.prompt, 'prompt');
  const enhance = req.body?.enhance !== false;
  const snap = await getSnapshot();
  res.json(await answerQuestion(prompt, snap, { enhance }));
}));

export default r;
