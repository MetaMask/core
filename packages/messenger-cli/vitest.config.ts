import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      coverage: {
        exclude: ['src/cli.ts'],

        thresholds: {
          branches: 89.81,
          functions: 100,
          lines: 97.38,
          statements: 97.39,
        },
      },
    },
  }),
);
