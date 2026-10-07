import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.mts';

export default mergeConfig(baseConfig, {
  test: {
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
