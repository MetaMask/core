import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

// This package is not `"type": "module"`, so the config is an `.mts` file. The
// name is spelled out because `node:path` is off limits outside `.ts` configs.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'wallet-framework-docs',

      // The example code and its tests live in `content/`, next to the docs.
      include: ['content/**/*.test.ts'],

      coverage: {
        thresholds: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
