import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

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
