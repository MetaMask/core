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
          branches: 84.39,
          functions: 95.4,
          lines: 88.91,
          statements: 88.98,
        },
      },
    },
  }),
);
