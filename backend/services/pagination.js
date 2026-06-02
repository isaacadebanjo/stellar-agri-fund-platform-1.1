// Opt-in pagination for list endpoints.
//
// `paginate(query)` returns null when neither `page` nor `limit` is present, so
// callers can keep returning the full array for backward compatibility with the
// existing frontend. When pagination IS requested it returns clamped
// { page, limit, skip } for use in a .skip().limit() query, and `listResponse`
// wraps the rows in the `{ data, pagination }` envelope used elsewhere in the
// API (treasury, activity).

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function paginate(query = {}) {
  if (query.page === undefined && query.limit === undefined) return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

export function listResponse(data, total, pg) {
  return {
    data,
    pagination: {
      page: pg.page,
      limit: pg.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pg.limit))
    }
  };
}
