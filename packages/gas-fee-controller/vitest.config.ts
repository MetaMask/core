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
          branches: 85.36,
          functions: 91.42,
          lines: 91.3,
          statements: 91.41,
        },
      },
    },
  }),
);
