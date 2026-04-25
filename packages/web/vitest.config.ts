import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: [
      {
        find: /^@daedalus\/shared\/(.+)$/,
        replacement: resolve(__dirname, '../shared/src/$1/index.ts'),
      },
      {
        find: '@daedalus/shared',
        replacement: resolve(__dirname, '../shared/src/index.ts'),
      },
    ],
  },
});
