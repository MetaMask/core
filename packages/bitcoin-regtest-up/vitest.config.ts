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
        exclude: ['src/bin/bitcoin-regtest-up.ts'],

        thresholds: {
          branches: 62.5,
          functions: 100,
          lines: 92.63,
          statements: 92.7,
        },
      },
    },
  }),
);
