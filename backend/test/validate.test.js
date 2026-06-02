import { describe, it, expect } from 'vitest';
import { amount, feePercent, id, nonEmptyString, optionalIsoDate, BadRequest } from '../services/validate.js';

describe('validate.amount', () => {
  it('accepts positive numbers and numeric strings', () => {
    expect(amount(5)).toBe(5);
    expect(amount('12.5')).toBe(12.5);
  });

  it('rejects NaN, non-numeric, zero and negatives', () => {
    for (const bad of [0, -1, 'abc', NaN, Infinity, undefined, null, '']) {
      expect(() => amount(bad)).toThrow(BadRequest);
    }
  });
});

describe('validate.feePercent', () => {
  it('defaults when omitted and clamps the valid range', () => {
    expect(feePercent(undefined)).toBe(10);
    expect(feePercent('')).toBe(10);
    expect(feePercent(0)).toBe(0);
    expect(feePercent(100)).toBe(100);
    expect(feePercent('25')).toBe(25);
  });

  it('rejects out-of-range and non-numeric values', () => {
    for (const bad of [-1, 101, 'x', NaN]) {
      expect(() => feePercent(bad)).toThrow(BadRequest);
    }
  });
});

describe('validate.id / nonEmptyString', () => {
  it('returns trimmed strings', () => {
    expect(id(' abc ')).toBe('abc');
    expect(nonEmptyString('  x ', 'name')).toBe('x');
  });

  it('rejects empty/non-string', () => {
    for (const bad of ['', '   ', 42, null, undefined, {}]) {
      expect(() => id(bad)).toThrow(BadRequest);
    }
  });
});

describe('validate.optionalIsoDate', () => {
  it('returns undefined when omitted', () => {
    expect(optionalIsoDate('', 'd')).toBeUndefined();
    expect(optionalIsoDate(undefined, 'd')).toBeUndefined();
  });

  it('normalizes a valid date to UTC midnight', () => {
    const d = optionalIsoDate('2026-05-17', 'periodStart');
    expect(d.toISOString()).toBe('2026-05-17T00:00:00.000Z');
  });

  it('throws on an unparseable date', () => {
    expect(() => optionalIsoDate('not-a-date', 'periodStart')).toThrow(BadRequest);
  });
});

describe('BadRequest', () => {
  it('carries httpStatus 400 for the central error handler', () => {
    expect(new BadRequest('x').httpStatus).toBe(400);
  });
});
