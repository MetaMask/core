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

      setupFiles: ['./tests/setup.ts'],

      coverage: {
        exclude: ['src/**/__fixtures__/**', 'src/**/mocks/**'],

        thresholds: {
          branches: 85.03,
          functions: 91.45,
          lines: 95.09,
          statements: 95.13,
        },
      },
    },
  }),
);
