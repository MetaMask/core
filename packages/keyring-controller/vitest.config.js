import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(baseConfig, {
  test: {
    name: basename(dirname(fileURLToPath(import.meta.url))),

    coverage: {
      thresholds: {
        branches: 95.75,
        functions: 100,
        lines: 99.15,
        statements: 99.16,
      },
    },
  },
});
