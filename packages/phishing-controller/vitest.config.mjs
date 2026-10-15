import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mjs';

export default mergeConfig(baseConfig, {
  test: {
    // The display name when running multiple projects. Derived from
    // `import.meta.url` rather than `import.meta.dirname`, which needs a
    // newer Node than this repo's engines range allows.
    name: basename(dirname(fileURLToPath(import.meta.url))),

    coverage: {
      thresholds: {
        branches: 98.95,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
