import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

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
