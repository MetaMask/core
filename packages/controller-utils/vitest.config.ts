import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      environment: 'jsdom',

      coverage: {
        thresholds: {
          branches: 85.89,
          functions: 86.36,
          lines: 89.68,
          statements: 89.68,
        },
      },
    },
  }),
);
