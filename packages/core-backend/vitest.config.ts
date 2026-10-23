import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      // Use jsdom for BackendWebSocketService tests
      environment: 'jsdom',

      coverage: {
        thresholds: {
          branches: 98.89,
          functions: 99.16,
          lines: 99.78,
          statements: 99.78,
        },
      },
    },
  }),
);
