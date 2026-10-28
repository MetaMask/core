import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      setupFiles: ['./tests/setup.ts'],

      coverage: {
        thresholds: {
          branches: 86.21,
          functions: 88.86,
          lines: 91.59,
          statements: 91.5,
        },
      },
    },
  }),
);
