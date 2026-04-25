import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_AUTHOR__: JSON.stringify('test'),
  },
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
