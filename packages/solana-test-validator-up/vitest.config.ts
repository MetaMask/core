import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      coverage: {
        // The CLI entrypoint is exercised through package builds and installed-bin smoke tests.
        exclude: ['src/bin/solana-test-validator-up.ts'],

        thresholds: {
          branches: 56.86,
          functions: 100,
          lines: 91.56,
          statements: 91.66,
        },
      },
    },
  }),
);
