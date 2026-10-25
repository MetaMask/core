import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import { lowerDecorators } from '../../tests/vitest/lower-decorators.js';
import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [lowerDecorators()],

    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      coverage: {
        thresholds: {
          branches: 99.44,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
