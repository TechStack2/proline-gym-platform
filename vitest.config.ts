import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    // src unit tests + the OXY-HOST Cloudflare Worker's pure-logic tests (plain
    // ESM, no Workers runtime required — infra/cf-worker/src/*.test.mjs).
    include: ['src/**/*.test.ts', 'infra/cf-worker/**/*.test.mjs'],
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
