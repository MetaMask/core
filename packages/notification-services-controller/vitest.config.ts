import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      // These tests rely on the Crypto API and on `window`.
      environment: 'jsdom',

      coverage: {
        exclude: ['src/**/__fixtures__/**', 'src/**/mocks/**'],

        thresholds: {
          branches: 80.77,
          functions: 92,
          lines: 92.89,
          statements: 93.07,
        },
      },
    },
  }),
);
