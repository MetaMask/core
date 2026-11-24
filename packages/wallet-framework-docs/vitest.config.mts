import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      include: ['content/**/*.test.ts'],

      coverage: {
        include: ['content/**/*.ts'],

        exclude: [
          // This file doesn't need tests, it's just a stub
          'content/data-services/writing-data-services/01-getting-started/orders-service.ts',
        ],

        thresholds: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
