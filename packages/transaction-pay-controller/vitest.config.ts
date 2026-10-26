import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig, { lowerDecorators } from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [lowerDecorators()],

    test: {
      name: basename(import.meta.dirname),

      coverage: {
        thresholds: {
          branches: 99.44,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
