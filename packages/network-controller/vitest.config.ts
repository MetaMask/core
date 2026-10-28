import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      typecheck: {
        ignoreSourceErrors: true,
      },

      coverage: {
        exclude: ['src/**/*.test-d.ts'],

        thresholds: {
          branches: 93.17,
          functions: 97.94,
          lines: 97.47,
          statements: 97.36,
        },
      },
    },
  }),
);
