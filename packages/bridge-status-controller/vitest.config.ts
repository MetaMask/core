import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(import.meta.dirname),

      taskTitleValueFormatTruncate: Infinity,

      coverage: {
        exclude: [
          'src/**/strategy/types.ts',
          'src/**/quote-status-manager/types.ts',
          'src/**/__fixtures__/**',
        ],

        thresholds: {
          'src/bridge-status-controller.ts': {
            branches: 95.96,
            functions: 96.36,
            lines: 99.4,
            statements: 99.4,
          },
          'src/bridge-status-controller.intent.ts': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
          },
          branches: 97.22,
          functions: 99.37,
          lines: 99.87,
          statements: 99.88,
        },
      },
    },
  }),
);
