import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mts';

export default mergeConfig(baseConfig, {
  test: {
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
