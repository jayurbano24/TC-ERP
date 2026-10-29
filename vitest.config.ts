import { defineConfig } from 'vitest/config';
import path from 'path';

const alias = {
  '@': path.resolve(__dirname, './src'),
};

/** Excluidos de test:unit — integración / backfill / scripts con DB real. */
const UNIT_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  'src/scripts/**',
  '**/*.integration.test.ts',
  '**/*Integration.test.ts',
];

export default defineConfig({
  resolve: { alias },
  test: {
    globals: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          // scripts/upgrade tiene `npm run test:upgrade:package` (fixtures independientes).
          include: ['src/**/*.test.ts'],
          exclude: UNIT_EXCLUDES,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          exclude: UNIT_EXCLUDES,
        },
      },
    ],
  },
});
