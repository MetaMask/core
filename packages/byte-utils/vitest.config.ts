import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // oxlint-disable-next-line n/no-unsupported-features/node-builtins
      name: basename(import.meta.dirname),

      typecheck: {
        tsconfig: './tsconfig.test.json',
      },

      coverage: {
        exclude: ['src/**/__fixtures__/**', 'src/**/*.test-d.ts'],

        thresholds: {
          branches: 85.18,
          functions: 97.05,
          lines: 87.01,
          statements: 85.71,
        },
      },
    },
  }),
);
