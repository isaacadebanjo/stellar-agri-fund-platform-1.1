import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    // mongodb-memory-server can take a moment to spin up the first time.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
