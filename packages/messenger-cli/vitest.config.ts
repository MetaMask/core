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
        exclude: ['src/cli.ts'],

        thresholds: {
          branches: 89.81,
          functions: 100,
          lines: 97.38,
          statements: 97.39,
        },
      },
    },
  }),
);
