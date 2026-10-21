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
        // `cli.ts` is tested by spawning it in a child process, which coverage
        // cannot see.
        exclude: ['src/cli.ts'],

        thresholds: {
          branches: 97.62,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
