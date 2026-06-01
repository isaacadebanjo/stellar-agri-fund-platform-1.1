// Test environment defaults. Set before any module under test reads them
// (crypto.js caches the key on first use).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-for-production';
process.env.WALLET_ENC_KEY =
  process.env.WALLET_ENC_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
