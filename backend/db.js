import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(__dirname, 'data.json');

const defaultData = {
  investors: [],
  wallets: [],
  transactions: [],
  projects: [],
  payouts: [],
  farmers: [],
  revenue: [],
  distributions: [],
  treasury: null
};

export const db = await JSONFilePreset(dbFile, defaultData);

// Backfill collections introduced in later phases so older data.json files keep working.
for (const key of ['investors', 'wallets', 'transactions', 'projects', 'payouts', 'farmers', 'revenue', 'distributions']) {
  if (!Array.isArray(db.data[key])) db.data[key] = [];
}

// Backfill new project fields introduced in Phase 3.
for (const p of db.data.projects) {
  if (p.cropType === undefined) p.cropType = '';
  if (p.status === undefined) p.status = 'active';
  if (p.startDate === undefined) p.startDate = '';
  if (p.endDate === undefined) p.endDate = '';
}

// Ensure baseline state: one treasury wallet + one default project (spinach pilot).
import { Keypair } from 'stellar-sdk';
import { nanoid } from 'nanoid';

let mutated = false;

if (!db.data.treasury) {
  const kp = Keypair.random();
  const treasuryWallet = {
    id: nanoid(8),
    label: 'Central Treasury',
    publicKey: kp.publicKey(),
    secret: kp.secret(),
    type: 'treasury',
    balance: 0,
    createdAt: new Date().toISOString()
  };
  db.data.wallets.push(treasuryWallet);
  db.data.treasury = treasuryWallet.id;
  mutated = true;
}

if (db.data.projects.length === 0) {
  db.data.projects.push({
    id: nanoid(8),
    name: 'Spinach Pilot',
    description: 'Pilot spinach cultivation program with smallholder farmers.',
    cropType: 'Spinach',
    status: 'active',
    startDate: '',
    endDate: '',
    allocated: 0,
    spent: 0,
    createdAt: new Date().toISOString()
  });
  mutated = true;
}

if (mutated) await db.write();

export function getTreasury() {
  return db.data.wallets.find(w => w.id === db.data.treasury);
}
