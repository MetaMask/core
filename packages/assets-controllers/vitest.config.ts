import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      // We rely on `window` to make requests
      environment: 'jsdom',

      coverage: {
        exclude: ['**/__fixtures__/**'],

        thresholds: {
          branches: 91.05,
          functions: 98.23,
          lines: 98.02,
          statements: 98.02,
        },
      },
    },
  }),
);
