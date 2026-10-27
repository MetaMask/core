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
          branches: 72.76,
          functions: 79.05,
          lines: 83.46,
          statements: 83.46,
        },
      },
    },
  }),
);
