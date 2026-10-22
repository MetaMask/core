import base, { createConfig } from '@metamask/oxlint-config';
import commonjs from '@metamask/oxlint-config-commonjs';
import jest from '@metamask/oxlint-config-jest';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';
import vitest from '@metamask/oxlint-config-vitest';

import { getJestWorkspaceLocations } from './test-runner-package-map.cjs';

const jestTestFiles = (await getJestWorkspaceLocations()).flatMap(
  (location) => [
    `${location}/**/*.test.ts`,
    `${location}/**/test/**`,
    `${location}/**/tests/**`,
  ],
);

export default createConfig({
  extends: [base],

  ignorePatterns: [
    '**/.docusaurus',
    '**/.tsc-lint-cache',
    '**/coverage/**',
    '**/dist/**',
    '**/api-docs/**',
    '.platform-api-docs/**',
    '.skills-cache/**',
    '.yarn/**',
    'merged-packages/**',
    'packages/wallet-framework-docs/site/build/**',
  ],

  options: {
    // TODO: Enable this once all unused disable directives are removed.
    // For the initial migration of ESLint to Oxlint, there are many unused
    // ones, and removing them all in a single pull request would result in a
    // large, hard to review pull request.
    // reportUnusedDisableDirectives: 'error',
    typeAware: true,
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.mts', '**/*.cts'],
      extends: [typescript],
      rules: {
        // TODO: Auto-fix breaks stuff.
        'typescript/promise-function-async': 'off',
      },
    },

    {
      files: ['**/*.cjs', '**/*.cts'],
      extends: [nodejs, commonjs],
      rules: {
        'import/extensions': 'off',
      },
    },

    {
      files: [
        '.github/**',
        'yarn.config.cjs',
        'packages/bitcoin-regtest-up/**',
        'packages/local-node-utils/**',
        'packages/foundryup/**',
        'packages/java-tron-up/**',
        'packages/messenger-cli/**',
        'packages/platform-api-docs/**',
        '**/scripts/**',
        'oxlint.config.ts',
        'jest.config.packages.cjs',
        'jest.config.scripts.cjs',
        'vitest.config.packages.ts',
        // These import their globals explicitly.
        'tests/helpers.ts',
        'tests/matchers.ts',
        'tests/scripts-setup.ts',
        'tests/setupAfterEnv/**',
        'tests/vitest/**',
      ],
      extends: [nodejs],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
      },
    },

    {
      files: ['test-runner-package-map.cjs'],
      rules: {
        'import/unambiguous': 'off',
      },
    },

    {
      files: [
        'packages/*/jest.config.cjs',
        'packages/*/jest.config.e2e.cjs',
        'packages/*/jest.environment.cjs',
        'packages/*/jest.config.integration.cjs',
        'packages/*/jest.config.unit.cjs',
        'scripts/**/*.test.ts',
        ...jestTestFiles,
      ],
      extends: [nodejs, jest],
      plugins: ['typescript'],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
        'typescript/no-unsafe-assignment': 'off',
      },
    },

    {
      files: ['packages/advanced-chart-core/**'],
      env: { browser: true },
    },

    {
      files: [
        'tests/vitest/**',
        'vitest.config.packages.ts',
        'packages/*/vitest.config.ts',
        'packages/*/**/*.test.ts',
        'packages/*/**/test/**',
        'packages/*/**/tests/**',
      ],
      excludeFiles: jestTestFiles,
      extends: [nodejs, vitest],
      plugins: ['typescript'],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
        'typescript/no-unsafe-assignment': 'off',
      },
    },

    {
      files: [
        'packages/bitcoin-regtest-up/src/bin/bitcoin-regtest-up.ts',
        'packages/foundryup/src/cli.ts',
        'packages/java-tron-up/src/bin/java-tron-up.ts',
        'packages/messenger-cli/src/cli.ts',
        'packages/platform-api-docs/src/cli.ts',
      ],
      rules: {
        'n/hashbang': 'off',
      },
    },

    {
      files: ['scripts/**/*.ts'],
      rules: {
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            checkTypeImports: true,
            pattern: {
              ts: 'ignorePackages',
              js: 'never',
            },
          },
        ],
      },
    },

    {
      files: ['scripts/**/*.ts'],
      excludeFiles: ['scripts/**/*.test.ts'],
      rules: {
        // Disallow importing from `@metamask/utils(/node)` in scripts, since
        // it uses non-erasable syntax, so type stripping with Node.js does not
        // work. We can remove this once we update it to remove the non-erasable
        // syntax.
        'eslint/no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@metamask/utils',
                message:
                  'Do not import from `@metamask/utils` in scripts. If required, copy the function to `./scripts/lib/utils.ts` instead.',
              },
              {
                name: '@metamask/utils/node',
                message:
                  'Do not import from `@metamask/utils/node` in scripts. If required, copy the function to `./scripts/lib/utils.ts` instead.',
              },
            ],
          },
        ],
      },
    },
  ],
});
