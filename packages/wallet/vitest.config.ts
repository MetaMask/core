import { basename } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { lowerDecorators } from '../../scripts/vitest/lower-decorators.js';
import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    // `AssetsController` uses a decorator that Vitest's type stripper leaves in
    // place. Lower it before Node parses the controller source.
    plugins: [lowerDecorators()],

    test: {
      name: basename(import.meta.dirname),

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
