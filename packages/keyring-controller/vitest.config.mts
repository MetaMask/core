import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mts';

export default mergeConfig(baseConfig, {
  test: {
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
