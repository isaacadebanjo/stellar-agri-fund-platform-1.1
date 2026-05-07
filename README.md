# Agri Funds Tracker (MVP)

Prototype web app for tracking investor fund flow in an agriculture investment platform.

```
Investor wallet  ──▶  Central Treasury  ──▶  Project allocation  ──▶  Farmer payout
```

## Stack

- **Backend**: Node.js + Express, lowdb (JSON file store), `stellar-sdk` for keypair generation
- **Frontend**: React + Vite (single-page dashboard, no router needed)
- **Asset**: USDC (mocked — real testnet submission is a one-line swap in `backend/services/stellar.js`)

## Run

Two terminals.

**Terminal 1 — backend** (port 4000):
```bash
cd backend
npm install
npm start
```

**Terminal 2 — frontend** (port 5173, proxies `/api` to 4000):
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Demo flow

1. **Investors** → "Add investor" (creates a real Stellar keypair).
2. Click **Fund** to top up the investor wallet (simulates them depositing USDC).
3. Click **Invest →** to send USDC from the investor wallet to the treasury.
4. **Projects** → "Allocate funds" on Spinach Pilot to move USDC from treasury into the project's earmarked balance.
5. **Farmers** → add a farmer (assign one or more projects).
6. **Payouts** → record a manual payout (project → farmer); this debits the project's remaining balance and credits the farmer's total received.
7. **Revenue** → record sales income earned by a project (source = market / buyer).
8. **Dashboard** shows totals at every stage incl. **Total Revenue** and **Estimated Profit** (revenue − payouts). **Transactions** is the unified ledger across investment / allocation / payout stages.

The `data.json` file in `backend/` is the database — delete it to reset.

## Data model

| Collection     | Fields                                                                 |
|----------------|------------------------------------------------------------------------|
| `investors`    | id, name, email, walletId, createdAt                                   |
| `wallets`      | id, label, publicKey, secret, type (`treasury`/`investor`), balance    |
| `projects`     | id, name, description, allocated, spent — API also returns `revenue`, `profit`, `remaining` |
| `transactions` | id, stage (`investment`/`allocation`/`payout`), amount, sender, receiver, projectId, txHash, timestamp |
| `payouts`      | id, projectId, farmerId, farmerName, farmerWallet, amount, note, timestamp |
| `farmers`      | id, name, walletId, assignedProjects, createdAt — API also returns `totalReceived`, `payoutCount` |
| `revenue`      | id, projectId, amount, source, timestamp                               |

## API

```
GET  /api/health
GET  /api/dashboard

GET  /api/investors
POST /api/investors                 { name, email? }
POST /api/investors/:id/fund        { amount }

GET  /api/projects
POST /api/projects                  { name, description? }

GET  /api/transactions
POST /api/transactions/invest       { investorId, amount }
POST /api/transactions/allocate     { projectId, amount }

GET  /api/payouts
POST /api/payouts                   { projectId, farmerId, amount, note? }

GET  /api/farmers
POST /api/farmers                   { name, walletId?, assignedProjects?: string[] }

GET  /api/revenue                   ?projectId=… (optional filter)
POST /api/revenue                   { projectId, amount, source? }
```

## Going to real Stellar testnet

`backend/services/stellar.js` already generates real Stellar keypairs. To submit real testnet
transactions instead of mocking them, replace `simulateTransfer` with a `Server.submitTransaction`
call (use Friendbot to fund accounts, set up a USDC trustline, then build a payment op).

## Scope

MVP only — no auth, no production security, manual payout entry, balances tracked in DB rather
than on-chain.
