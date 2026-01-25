import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/test-helpers.ts', '**/*.test.ts', '**/dist/**'],
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 60,
        statements: 65,
      },
    },
  },
});
