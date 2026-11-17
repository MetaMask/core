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
          branches: 96.03,
          functions: 95.51,
          lines: 97.91,
          statements: 97.88,
        },
      },
    },
  }),
);
