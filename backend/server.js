import express from 'express';
import cors from 'cors';
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Agri-funds API listening on http://localhost:${PORT}`);
});
