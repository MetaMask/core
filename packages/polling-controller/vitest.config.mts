import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mts';

export default mergeConfig(baseConfig, {
  test: {
    coverage: {
      thresholds: {
        branches: 82.35,
        functions: 87.5,
        lines: 92.13,
        statements: 92.55,
      },
    },
  },
});
