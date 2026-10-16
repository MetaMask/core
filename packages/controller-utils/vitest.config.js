import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

export default mergeConfig(baseConfig, {
  test: {
    name: basename(dirname(fileURLToPath(import.meta.url))),

    // Jest ran this package under jsdom, via a custom environment that also
    // patched in `TextEncoder` for `@noble/hashes`. Node provides that now,
    // so plain jsdom is enough.
    environment: 'jsdom',

    coverage: {
      thresholds: {
        branches: 85.89,
        functions: 86.36,
        lines: 89.68,
        statements: 89.68,
      },
    },
  },
});
