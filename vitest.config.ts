import { defineConfig } from 'vitest/config';
import path from 'path';

const alias = {
  '@': path.resolve(__dirname, './src'),
};

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
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
