import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: [],
    include: ['tests/**/*.test.js'],
    sequence: {
      concurrent: false, // SQLite tests must run sequentially
    },
  },
});
