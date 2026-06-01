// Load backend/.env if present (local dev convenience only). In production,
// Render/Vercel inject real env vars and no .env file exists — dotenv is a
// silent no-op in that case, so nothing here REQUIRES a local .env at runtime.
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { seedIfNeeded } from './config/seed.js';
import { requireAuth } from './middleware/auth.js';
import auth from './routes/auth.js';
import investors from './routes/investors.js';
import projects from './routes/projects.js';
import transactions from './routes/transactions.js';
import payouts from './routes/payouts.js';
import dashboard from './routes/dashboard.js';
import farmers from './routes/farmers.js';
import revenue from './routes/revenue.js';
import distributions from './routes/distributions.js';
import reports from './routes/reports.js';
import activity from './routes/activity.js';
import statements from './routes/statements.js';
import treasury from './routes/treasury.js';
import events from './routes/events.js';

const app = express();

// Behind Render's proxy — required for correct req.ip in rate limiting.
app.set('trust proxy', 1);

// Baseline security headers.
app.use(helmet());

// Request logging.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS allowlist. Set CORS_ORIGIN to a comma-separated list of allowed
// frontend origins (e.g. "https://agri-funds.vercel.app"). Requests with no
// Origin (curl, health checks, same-origin) are always allowed. In non-prod,
// localhost is permitted so the Vite dev server works without extra config.
//
// Vercel generates a unique URL per preview deploy (e.g.
// https://agri-funds-git-feature-team.vercel.app). Set
// CORS_ALLOW_VERCEL_PREVIEWS=true to allow any "*.vercel.app" origin so those
// previews can talk to this API without hand-listing every URL.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const allowVercelPreviews = process.env.CORS_ALLOW_VERCEL_PREVIEWS === 'true';
const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;
const isProd = process.env.NODE_ENV === 'production';
if (isProd && allowedOrigins.length === 0 && !allowVercelPreviews) {
  console.warn('[cors] CORS_ORIGIN is not set — all cross-origin requests will be rejected in production.');
}

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (allowVercelPreviews && VERCEL_PREVIEW_RE.test(origin)) return cb(null, true);
    if (!isProd && /^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));

// Public endpoints (no auth required). Health reports DB connectivity so
// Render's health check fails fast if MongoDB is down.
app.get('/api/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ ok: dbUp, db: dbUp ? 'connected' : 'disconnected' });
});
app.use('/api/auth', auth);

// SSE: /events/ticket is authenticated and issues a short-lived ticket the
// stream itself uses (EventSource can't send Authorization headers). Mounted
// BEFORE the global requireAuth so the public stream route stays reachable.
app.use('/api/events', events);

// Everything below requires a valid JWT. Per-route role checks live in
// the route files themselves (e.g. requireRole('admin') for write paths).
app.use('/api', requireAuth);
app.use('/api/investors', investors);
app.use('/api/projects', projects);
app.use('/api/transactions', transactions);
app.use('/api/payouts', payouts);
app.use('/api/dashboard', dashboard);
app.use('/api/farmers', farmers);
app.use('/api/revenue', revenue);
app.use('/api/distributions', distributions);
app.use('/api/reports', reports);
app.use('/api/activity', activity);
app.use('/api/statements', statements);
app.use('/api/treasury', treasury);

// Central error handler — catches anything thrown from asyncH-wrapped routes.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('API error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'invalid id format' });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

let httpServer = null;
let shuttingDown = false;

// Drain in-flight requests, then close Mongo, on the SIGTERM Render sends.
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — closing gracefully`);

  const forceExit = setTimeout(() => {
    console.error('[shutdown] forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();

  try {
    if (httpServer) {
      await new Promise((resolve, reject) =>
        httpServer.close(err => (err ? reject(err) : resolve()))
      );
    }
    await mongoose.connection.close();
    clearTimeout(forceExit);
    console.log('[shutdown] clean exit');
    process.exit(0);
  } catch (err) {
    console.error('[shutdown] error during shutdown:', err.message);
    process.exit(1);
  }
}

async function start() {
  try {
    // Fail fast on a misconfigured deploy, before opening any connections.
    validateEnv();
    await connectDB();
    await seedIfNeeded();
    httpServer = app.listen(PORT, () => {
      console.log(`Agri-funds API listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
