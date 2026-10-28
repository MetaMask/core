import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

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
