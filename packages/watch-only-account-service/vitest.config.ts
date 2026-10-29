import { basename } from 'node:path';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(baseConfig, {
  test: {
    // oxlint-disable-next-line n/no-unsupported-features/node-builtins
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
});
