import { describe, it, expect } from 'vitest';
import { round, sum, add, sub, mul, pct } from '../services/money.js';

describe('money.round', () => {
  it('rounds half up without binary-float artifacts', () => {
    expect(round(1.005)).toBe(1.01);
    expect(round(2.675)).toBe(2.68);
    expect(round(0.1 + 0.2)).toBe(0.3);
  });
  it('handles non-finite input safely', () => {
    expect(round(NaN)).toBe(0);
    expect(round(Infinity)).toBe(0);
  });
});

describe('money.sum', () => {
  it('does not drift when accumulating many amounts', () => {
    const items = Array(2000).fill({ a: 0.1 });
    const naive = items.reduce((s, x) => s + x.a, 0);
    expect(naive).not.toBe(200); // demonstrates the bug being fixed
    expect(sum(items, x => x.a)).toBe(200);
  });
  it('sums raw numbers with the identity selector', () => {
    expect(sum([0.1, 0.2, 0.3])).toBe(0.6);
  });
});

describe('money.add/sub/mul/pct', () => {
  it('add/sub are exact at 2dp', () => {
    expect(add(0.1, 0.2)).toBe(0.3);
    expect(sub(0.3, 0.1)).toBe(0.2);
  });
  it('pct computes a percentage rounded to 2dp', () => {
    expect(pct(1000, 10)).toBe(100);
    expect(pct(33.33, 50)).toBe(16.67);
  });
  it('mul rounds the product', () => {
    expect(mul(10, 0.333)).toBe(3.33);
  });
  // Independent half-up rounding of each investor's percentage share can
  // differ from the pool by at most one cent per recipient. Documenting the
  // real behaviour (rather than asserting a false "never exceeds" invariant)
  // so a future settlement step can decide how to absorb the residual.
  it('a split stays within one cent per recipient of the net profit', () => {
    const net = 1000.07;
    const shares = [33.3333, 33.3333, 33.3334];
    const allocated = sum(shares, sp => pct(net, sp));
    expect(Math.abs(allocated - net)).toBeLessThanOrEqual(shares.length * 0.01);
  });
});
