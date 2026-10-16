import { basename } from 'node:path';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(baseConfig, {
  test: {
    // oxlint-disable-next-line n/no-unsupported-features/node-builtins
    name: basename(import.meta.dirname),

    typecheck: {
      enabled: true,
    },

    coverage: {
      // Type tests never execute, so they have no coverage to collect.
      exclude: ['src/**/*.test-d.ts'],

      thresholds: {
        branches: 98.97,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
