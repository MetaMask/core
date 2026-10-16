import { basename } from 'node:path';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(baseConfig, {
  test: {
    // oxlint-disable-next-line n/no-unsupported-features/node-builtins
    name: basename(import.meta.dirname),

    // Most of this package's tests live in `src`, which the base config
    // already covers, but the `NetworkController` suites live in `tests`.
    include: ['tests/**/*.test.ts'],

    coverage: {
      // Type tests never execute, so they have no coverage to collect.
      exclude: ['src/**/*.tst.ts'],

      thresholds: {
        branches: 93.17,
        functions: 97.94,
        lines: 97.47,
        statements: 97.36,
      },
    },
  },
});
