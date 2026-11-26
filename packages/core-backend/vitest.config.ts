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
          branches: 94.92,
          functions: 98.48,
          lines: 98.24,
          statements: 98.05,
        },
      },
    },
  }),
);
