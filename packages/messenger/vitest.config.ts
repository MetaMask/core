import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // oxlint-disable-next-line n/no-unsupported-features/node-builtins
      name: basename(import.meta.dirname),

      coverage: {
        exclude: ['src/**/*.test-d.ts'],

        thresholds: {
          branches: 98.97,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
