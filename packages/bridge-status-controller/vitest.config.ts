import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      taskTitleValueFormatTruncate: Infinity,

      coverage: {
        provider: 'v8',

        exclude: [
          'src/**/strategy/types.ts',
          'src/**/quote-status-manager/types.ts',
          'src/**/*-method-action-types.ts',
        ],

        thresholds: {
          'src/bridge-status-controller.ts': {
            branches: 95.96,
            functions: 96.36,
            lines: 99.41,
            statements: 99.41,
          },
          'src/bridge-status-controller.intent.ts': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
          },
          branches: 96.5,
          functions: 98.88,
          lines: 99.78,
          statements: 99.78,
        },
      },
    },
  }),
);
