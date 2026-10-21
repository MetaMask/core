import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

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
