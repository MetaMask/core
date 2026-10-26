import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      coverage: {
        // This file is tested indirectly in other packages' test suites.
        exclude: ['src/MockPollingBlockTracker.ts'],

        thresholds: {
          branches: 98.38,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
