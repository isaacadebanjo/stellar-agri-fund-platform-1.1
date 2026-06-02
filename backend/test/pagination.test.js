import { describe, it, expect } from 'vitest';
import { paginate, listResponse } from '../services/pagination.js';

describe('paginate', () => {
  it('returns null when neither page nor limit is present (back-compat array mode)', () => {
    expect(paginate({})).toBeNull();
    expect(paginate({ status: 'success' })).toBeNull();
  });

  it('parses and clamps page/limit', () => {
    expect(paginate({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10, skip: 10 });
    // floor at 1, ceil limit at 200
    expect(paginate({ page: '0', limit: '9999' })).toEqual({ page: 1, limit: 200, skip: 0 });
    // limit defaults to 50 when only page is given
    expect(paginate({ page: '3' })).toEqual({ page: 3, limit: 50, skip: 100 });
  });
});

describe('listResponse', () => {
  it('wraps rows with pagination metadata', () => {
    const pg = paginate({ page: '2', limit: '10' });
    const res = listResponse([{ id: 'a' }], 25, pg);
    expect(res.data).toEqual([{ id: 'a' }]);
    expect(res.pagination).toEqual({ page: 2, limit: 10, total: 25, pages: 3 });
  });

  it('always reports at least 1 page', () => {
    const pg = paginate({ page: '1', limit: '10' });
    expect(listResponse([], 0, pg).pagination.pages).toBe(1);
  });
});
