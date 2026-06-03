import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectMemoryDB, closeMemoryDB, clearCollections } from './db.js';

let Project, Revenue, getSnapshot, generateDeckPDF, generateOnePagerPDF, generatePackPDF, generateArchitecturePDF;

const isPdf = (buf) => Buffer.isBuffer(buf) && buf.slice(0, 5).toString() === '%PDF-';

beforeAll(async () => {
  await connectMemoryDB();
  // NOTE: deliberately do NOT create a treasury Wallet — that would make the
  // treasury overview call Stellar Horizon. With no treasury, analytics return a
  // well-formed zeroed snapshot and the PDFs still render (network-free test).
  Project = (await import('../models/Project.js')).default;
  Revenue = (await import('../models/Revenue.js')).default;
  ({ getSnapshot } = await import('../services/metricsSnapshot.js'));
  ({ generateDeckPDF } = await import('../services/deckPdf.js'));
  ({ generateOnePagerPDF } = await import('../services/onePagerPdf.js'));
  ({ generatePackPDF } = await import('../services/packPdf.js'));
  ({ generateArchitecturePDF } = await import('../services/architecturePdf.js'));
});
afterAll(closeMemoryDB);
beforeEach(clearCollections);

describe('metrics snapshot', () => {
  it('returns a reconciled, well-formed snapshot', async () => {
    await Project.create({ name: 'Spinach', status: 'active', hectares: 40, allocated: 1000, spent: 200 });
    await Revenue.create({ projectId: 'p1', amount: 500 });
    const snap = await getSnapshot();
    expect(snap.org.name).toBe('Agri Funds');
    expect(typeof snap.scores.investmentReadinessScore).toBe('number');
    expect(snap.treasury).toBeTruthy();
    expect(snap.kpi).toBeTruthy();
    expect(snap.risk.categories).toBeTruthy();
    expect(Array.isArray(snap.highlights)).toBe(true);
  });
});

describe('presentation PDFs', () => {
  it('renders deck, one-pager, packs and architecture as valid PDFs', async () => {
    await Project.create({ name: 'Spinach', status: 'active', hectares: 40, allocated: 1000, spent: 200, country: 'ZA' });
    const snap = await getSnapshot();

    expect(isPdf(await generateDeckPDF(snap))).toBe(true);
    expect(isPdf(await generateOnePagerPDF(snap))).toBe(true);
    expect(isPdf(await generateArchitecturePDF())).toBe(true);
    for (const kind of ['investor', 'committee', 'board', 'partner']) {
      expect(isPdf(await generatePackPDF(kind, snap))).toBe(true);
    }
  });

  it('rejects an unknown pack kind', async () => {
    const snap = await getSnapshot();
    await expect(generatePackPDF('bogus', snap)).rejects.toThrow();
  });
});
