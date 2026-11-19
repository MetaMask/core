import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      coverage: {
        // The CLI entrypoint is exercised through package builds and installed-bin smoke tests.
        exclude: ['src/bin/java-tron-up.ts'],

        thresholds: {
          branches: 56.41,
          functions: 100,
          lines: 85.03,
          statements: 85.15,
        },
      },
    },
  }),
);
