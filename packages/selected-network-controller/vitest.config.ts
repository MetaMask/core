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
          branches: 92.85,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
