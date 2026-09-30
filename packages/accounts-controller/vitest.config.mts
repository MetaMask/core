import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mts';

export default mergeConfig(baseConfig, {
  test: {
    coverage: {
      thresholds: {
        branches: 98.48,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
