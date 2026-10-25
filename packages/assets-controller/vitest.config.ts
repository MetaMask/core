import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import type { ViteUserConfig } from 'vitest/config';

import { lowerDecorators } from '../../tests/vitest/lower-decorators.js';
import baseConfig from '../../vitest.config.packages.js';

const name = basename(dirname(fileURLToPath(import.meta.url)));

/**
 * The suites selected with `--mode`. `yarn test` runs both the unit and the
 * integration suites, while `yarn test:unit` and `yarn test:integration` run
 * one of them with its own coverage report.
 */
const suites: Record<'test' | 'unit' | 'integration', ViteUserConfig> = {
  test: {
    test: {
      name,

      coverage: {
        thresholds: {
          branches: 82.17,
          functions: 90.01,
          lines: 90.56,
          statements: 90.56,
        },
      },
    },
  },

  unit: {
    test: {
      name: `${name}-unit`,

      // Integration suites are excluded so unit coverage and thresholds stand
      // on their own
      exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],

      coverage: {
        // Separate from the combined (`coverage/`) and integration
        // (`coverage/integration/`) reports
        reportsDirectory: 'coverage/unit',

        // Reflects the unit suite alone, unlike the combined thresholds
        thresholds: {
          branches: 85.46,
          functions: 92.36,
          lines: 93.21,
          statements: 93.25,
        },
      },
    },
  },

  integration: {
    test: {
      name: `${name}-integration`,

      coverage: {
        // Separate from the combined (`coverage/`) and unit (`coverage/unit/`)
        // reports
        reportsDirectory: 'coverage/integration',

        // Coverage here is informational; the unit suite owns the quality gate
      },
    },
  },
};

export default defineConfig(({ mode }) => {
  // Any other mode, such as the one tools like knip load the config with, gets
  // the combined suite
  const suite =
    mode === 'unit' || mode === 'integration' ? suites[mode] : suites.test;

  const config = mergeConfig(
    baseConfig,
    mergeConfig(
      defineConfig({
        plugins: [lowerDecorators()],

        test: {
          coverage: {
            exclude: ['**/__fixtures__/**', '**/*.test.ts'],
          },
        },
      }),
      suite,
    ),
  );

  if (mode !== 'integration') {
    return config;
  }

  return {
    ...config,
    test: {
      ...config.test,

      // Only the integration suites; set after merging, because `mergeConfig`
      // would add to the shared `include` rather than replace it
      include: ['src/**/*.integration.test.ts'],
    },
  };
});
