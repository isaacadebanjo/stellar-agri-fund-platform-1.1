// Wraps an async route handler so thrown errors / rejected promises forward
// to Express's central error handler instead of crashing the process.
export const asyncH = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
