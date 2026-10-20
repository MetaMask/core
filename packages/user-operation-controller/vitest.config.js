import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(baseConfig, {
  test: {
    name: basename(dirname(fileURLToPath(import.meta.url))),

    coverage: {
      thresholds: {
        branches: 97.62,
        functions: 100,
        lines: 99.57,
        statements: 99.57,
      },
    },
  },
});
