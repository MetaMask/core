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
          branches: 94.04,
          functions: 93.9,
          lines: 97.07,
          statements: 97.03,
        },
      },
    },
  }),
);
