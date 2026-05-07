import Transaction from '../models/Transaction.js';
import Distribution from '../models/Distribution.js';
import Payout from '../models/Payout.js';
import Revenue from '../models/Revenue.js';
import Wallet from '../models/Wallet.js';
import { getTreasury } from '../config/seed.js';
import { getLiveBalance } from './stellar.js';

/**
 * Compute comprehensive treasury metrics for dashboard analytics.
 * Non-blocking: fetches data from MongoDB and Stellar testnet, returns aggregated object.
 */
export async function getTreasuryOverview() {
  try {
    // Fetch treasury wallet
    const treasury = await getTreasury();
    if (!treasury) throw new Error('Treasury wallet not initialized');

    // Get live balance from Stellar testnet
    let treasuryBalance = 0;
    try {
      treasuryBalance = await getLiveBalance(treasury.publicKey);
    } catch (e) {
      console.warn('[treasury] Failed to fetch live balance:', e.message);
      treasuryBalance = treasury.balance || 0;
    }

    // Calculate total invested capital (successful investment transactions)
    const investmentTxs = await Transaction.find({
      stage: 'investment',
      status: 'success'
    });
    const totalInvestedCapital = investmentTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Calculate total allocated capital (successful allocation transactions)
    const allocationTxs = await Transaction.find({
      stage: 'allocation',
      status: 'success'
    });
    const totalAllocatedCapital = allocationTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Calculate pending payouts (pending payout transactions)
    const pendingPayoutTxs = await Transaction.find({
      stage: 'payout',
      status: 'pending'
    });
    const pendingPayouts = pendingPayoutTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);

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
      treasuryBalance,
      totalInvestedCapital,
      totalAllocatedCapital,
      pendingPayouts,
      pendingDistributions: pendingDistributionsAmount,
      totalRevenue,
      netPlatformPosition,
      availableLiquidity,
      capitalUtilizationPercent,
      liquidityHealth,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    console.error('[treasury] Error computing overview:', e);
    throw e;
  }
}

/**
 * Get historical treasury flows for chart visualization.
 * Returns daily aggregated inflows, outflows, and balance trend.
 */
export async function getTreasuryFlows(days = 90) {
  try {
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

    // Calculate running balance trend
    const overview = await getTreasuryOverview();
    let runningBalance = overview.treasuryBalance - flows.reduce((sum, f) => sum + (f.inflows - f.outflows), 0);

    const balanceTrend = flows.map(f => {
      runningBalance += f.inflows - f.outflows;
      return {
        date: f.date,
        balance: Math.max(0, runningBalance),
        inflows: f.inflows,
        outflows: f.outflows
      };
    });

    return balanceTrend;
  } catch (e) {
    console.error('[treasury] Error computing flows:', e);
    throw e;
  }
}

/**
 * Get pending obligations: failed transactions, unpaid distributions, pending payouts.
 */
export async function getPendingObligations() {
  try {
    const [failedTxs, unpaidDistributions, pendingPayoutTxs, payouts] = await Promise.all([
      Transaction.find({ status: 'failed' }).sort({ timestamp: -1 }).lean(),
      Distribution.find({ status: 'pending' }).sort({ timestamp: -1 }).lean(),
      Transaction.find({ stage: 'payout', status: 'pending' }).sort({ timestamp: -1 }).lean(),
      Payout.find().sort({ timestamp: -1 }).lean()
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
  } catch (e) {
    console.error('[treasury] Error fetching pending obligations:', e);
    throw e;
  }
}

/**
 * Get treasury transactions with filtering and pagination.
 */
export async function getTreasuryTransactions(opts = {}) {
  try {
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
        _id: tx._id,
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
  } catch (e) {
    console.error('[treasury] Error fetching transactions:', e);
    throw e;
  }
}
