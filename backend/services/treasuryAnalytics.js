import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import Revenue from '../models/Revenue.js';
import { getTreasury } from '../config/seed.js';
import { getLiveBalance } from './stellar.js';
import { round, sum } from './money.js';

/**
 * Compute comprehensive treasury metrics for dashboard analytics.
 * Non-blocking: fetches data from MongoDB and Stellar testnet, returns aggregated object.
 */
export async function getTreasuryOverview() {
  const treasury = await getTreasury();

  // Treasury not seeded yet — return a well-formed zeroed snapshot.
  if (!treasury) {
    return {
      treasuryBalance: 0,
      totalInvestedCapital: 0,
      totalAllocatedCapital: 0,
      pendingPayouts: 0,
      pendingDistributions: 0,
      totalRevenue: 0,
      netPlatformPosition: 0,
      availableLiquidity: 0,
      capitalUtilizationPercent: 0,
      liquidityHealth: 'Healthy',
      timestamp: new Date().toISOString(),
      debug: { note: 'Treasury wallet not initialized' }
    };
  }

  // Live balance from Stellar; fall back to the last known DB balance.
  let treasuryBalance;
  try {
    treasuryBalance = await getLiveBalance(treasury.publicKey);
  } catch (e) {
    console.warn('[treasury] live balance unavailable, using last known:', e.message);
    treasuryBalance = treasury.balance || 0;
  }

    // Calculate total invested capital (successful investment transactions)
    const investmentTxs = await Transaction.find({
      stage: 'investment',
      status: 'success'
    });
    const totalInvestedCapital = sum(investmentTxs, tx => tx.amount || 0);

    // Calculate total allocated capital (successful allocation transactions)
    const allocationTxs = await Transaction.find({
      stage: 'allocation',
      status: 'success'
    });
    const totalAllocatedCapital = sum(allocationTxs, tx => tx.amount || 0);

    // Calculate pending payouts (pending payout transactions)
    const pendingPayoutTxs = await Transaction.find({
      stage: 'payout',
      status: 'pending'
    });
    const pendingPayouts = sum(pendingPayoutTxs, tx => tx.amount || 0);

    // Calculate pending distributions
    const pendingDistributions = await Distribution.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingDistributionsAmount = pendingDistributions[0]?.total || 0;

    // Calculate total revenue
    const revenueAgg = await Revenue.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Calculate net platform position
    const netPlatformPosition = treasuryBalance + totalRevenue - totalInvestedCapital;

    // Calculate available liquidity (treasury balance - pending obligations)
    // Reserve buffer: 10% of total invested capital (or minimum 1000 XLM)
    const reserveBuffer = Math.max(totalInvestedCapital * 0.1, 1000);
    const availableLiquidity = treasuryBalance - pendingPayouts - pendingDistributionsAmount - reserveBuffer;

    // Calculate capital utilization percentage
    const capitalUtilizationPercent = totalInvestedCapital > 0
      ? Math.round((totalAllocatedCapital / totalInvestedCapital) * 100)
      : 0;

    // Determine liquidity health badge
    const healthThreshold = totalInvestedCapital * 0.2; // 20% of invested capital
    const criticalThreshold = totalInvestedCapital * 0.1; // 10% of invested capital
    let liquidityHealth = 'Healthy';
    if (availableLiquidity < criticalThreshold) {
      liquidityHealth = 'Critical';
    } else if (availableLiquidity < healthThreshold) {
      liquidityHealth = 'Tight';
    }

    return {
      treasuryBalance: round(treasuryBalance),
      totalInvestedCapital: round(totalInvestedCapital),
      totalAllocatedCapital: round(totalAllocatedCapital),
      pendingPayouts: round(pendingPayouts),
      pendingDistributions: round(pendingDistributionsAmount),
      totalRevenue: round(totalRevenue),
      netPlatformPosition: round(netPlatformPosition),
      availableLiquidity: round(availableLiquidity),
      capitalUtilizationPercent,
      liquidityHealth,
      timestamp: new Date().toISOString()
    };
}

/**
 * Get historical treasury flows for chart visualization.
 * Returns daily aggregated inflows, outflows, and balance trend.
 */
export async function getTreasuryFlows(days = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Fetch all transactions and revenues from the past N days
    const [transactions, revenues] = await Promise.all([
      Transaction.find({ timestamp: { $gte: cutoffDate } }).lean(),
      Revenue.find({ timestamp: { $gte: cutoffDate } }).lean()
    ]);

    // Group by date (YYYY-MM-DD)
    const flowsByDate = {};

    // Process transactions
    transactions.forEach(tx => {
      const dateStr = new Date(tx.timestamp).toISOString().split('T')[0];
      if (!flowsByDate[dateStr]) {
        flowsByDate[dateStr] = { inflows: 0, outflows: 0, date: dateStr };
      }

      if (tx.status === 'success') {
        // Inflows: investments (investor → treasury)
        if (tx.stage === 'investment') {
          flowsByDate[dateStr].inflows += tx.amount;
        }
        // Outflows: payouts and allocations (treasury → out)
        else if (tx.stage === 'payout' || tx.stage === 'allocation') {
          flowsByDate[dateStr].outflows += tx.amount;
        }
      }
    });

    // Process revenues (inflows)
    revenues.forEach(rev => {
      const dateStr = new Date(rev.timestamp).toISOString().split('T')[0];
      if (!flowsByDate[dateStr]) {
        flowsByDate[dateStr] = { inflows: 0, outflows: 0, date: dateStr };
      }
      flowsByDate[dateStr].inflows += rev.amount;
    });

    // Convert to sorted array
    const flows = Object.values(flowsByDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Running-balance trend. Use the treasury's current live balance directly
    // rather than recomputing the entire overview (which re-runs every
    // aggregation and an extra Horizon call just for this one number).
    const treasury = await getTreasury();
    let currentBalance = 0;
    if (treasury) {
      try {
        currentBalance = await getLiveBalance(treasury.publicKey);
      } catch {
        currentBalance = treasury.balance || 0;
      }
    }
    const netFlow = sum(flows, f => f.inflows - f.outflows);
    let runningBalance = currentBalance - netFlow;

    return flows.map(f => {
      runningBalance += f.inflows - f.outflows;
      return {
        date: f.date,
        balance: Math.max(0, runningBalance),
        inflows: f.inflows,
        outflows: f.outflows
      };
    });
}

/**
 * Get pending obligations: failed transactions, unpaid distributions, pending payouts.
 */
export async function getPendingObligations() {
  const [failedTxs, unpaidDistributions, pendingPayoutTxs] = await Promise.all([
    Transaction.find({ status: 'failed' }).sort({ timestamp: -1 }).lean(),
    Distribution.find({ status: 'pending' }).sort({ timestamp: -1 }).lean(),
    Transaction.find({ stage: 'payout', status: 'pending' }).sort({ timestamp: -1 }).lean()
  ]);

  const obligations = {
      failedTransactions: failedTxs.map(tx => ({
        type: 'FAILED_TRANSACTION',
        stage: tx.stage,
        amount: tx.amount,
        errorCode: tx.errorCode,
        timestamp: tx.timestamp,
        description: `Failed ${tx.stage} transaction (${tx.stage}: ${tx.senderLabel} → ${tx.receiverLabel})`
      })),
      unpaidDistributions: unpaidDistributions.map(d => ({
        type: 'UNPAID_DISTRIBUTION',
        amount: d.amount,
        investorId: d.investorId,
        projectId: d.projectId,
        timestamp: d.timestamp,
        description: `Unpaid distribution to investor (${d.amount} XLM)`
      })),
      pendingPayouts: pendingPayoutTxs.map(tx => ({
        type: 'PENDING_PAYOUT',
        amount: tx.amount,
        farmerId: tx.receiverId,
        timestamp: tx.timestamp,
        description: `Pending payout to ${tx.receiverLabel}`
      }))
    };

  return {
    total: failedTxs.length + unpaidDistributions.length + pendingPayoutTxs.length,
    obligations
  };
}

/**
 * Get treasury transactions with filtering and pagination.
 */
export async function getTreasuryTransactions(opts = {}) {
  const { page = 1, limit = 20, status, type } = opts;
  const skip = (page - 1) * limit;

  const query = {};
  if (status) query.status = status;
  if (type === 'inflow') {
    query.stage = 'investment';
  } else if (type === 'outflow') {
    query.stage = { $in: ['payout', 'allocation'] };
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query)
  ]);

  return {
    transactions: transactions.map(tx => ({
      // `id` to match the rest of the API (the _base.js toJSON transform);
      // this path uses .lean() so the transform doesn't apply automatically.
      id: tx._id,
      stage: tx.stage,
      type: tx.stage === 'investment' ? 'Inflow' : tx.stage === 'payout' ? 'Payout' : 'Allocation',
      amount: tx.amount,
      senderLabel: tx.senderLabel,
      receiverLabel: tx.receiverLabel,
      status: tx.status,
      txHash: tx.txHash,
      timestamp: tx.timestamp,
      network: tx.network
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}
