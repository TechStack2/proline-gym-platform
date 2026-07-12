import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` throws outside an RSC; stub it so suites whose import chain
      // touches it (invite.ts → audit/log.ts) can load and test their pure logic.
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
});
