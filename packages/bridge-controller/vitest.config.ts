import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      coverage: {
        thresholds: {
          'src/bridge-controller.ts': {
            branches: 93.49,
            functions: 98.43,
            lines: 97.98,
            statements: 97.99,
          },
          'src/selectors.ts': {
            branches: 91.42,
            functions: 100,
            lines: 100,
            statements: 100,
          },
          branches: 92,
          functions: 98,
          lines: 98,
          statements: 98,
        },
      },
    },
  }),
);
