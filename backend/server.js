import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { seedIfNeeded } from './config/seed.js';
import investors from './routes/investors.js';
import projects from './routes/projects.js';
import transactions from './routes/transactions.js';
import payouts from './routes/payouts.js';
import dashboard from './routes/dashboard.js';
import farmers from './routes/farmers.js';
import revenue from './routes/revenue.js';
import distributions from './routes/distributions.js';
import reports from './routes/reports.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/investors', investors);
app.use('/api/projects', projects);
app.use('/api/transactions', transactions);
app.use('/api/payouts', payouts);
app.use('/api/dashboard', dashboard);
app.use('/api/farmers', farmers);
app.use('/api/revenue', revenue);
app.use('/api/distributions', distributions);
app.use('/api/reports', reports);

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

async function start() {
  try {
    await connectDB();
    await seedIfNeeded();
    app.listen(PORT, () => {
      console.log(`Agri-funds API listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
