import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      coverage: {
        thresholds: {
          branches: 56.09,
          functions: 67.44,
          lines: 59.22,
          statements: 59.42,
        },
      },
    },
  }),
);
