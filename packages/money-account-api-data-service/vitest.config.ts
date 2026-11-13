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
          branches: 96,
          functions: 96,
          lines: 96,
          statements: 96,
        },
      },
    },
  }),
);
