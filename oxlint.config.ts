import base, { createConfig } from '@metamask/oxlint-config';
import commonjs from '@metamask/oxlint-config-commonjs';
import jest from '@metamask/oxlint-config-jest';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';
import vitest from '@metamask/oxlint-config-vitest';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const monorepoRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * The two test runners need separate overrides while the monorepo migrates from
 * Jest to Vitest, and a file must only match one of them: each config declares
 * its runner's globals, so a test file that matches both would have its explicit
 * `vitest` imports flagged as shadowing Jest's globals.
 *
 * A package is on Vitest once it has a `vitest.config.mts`, so the split is read
 * off disk rather than hand-maintained. Once every package has migrated, both
 * overrides collapse into the single `**\/*.test.ts` one that
 * `metamask-module-template` uses.
 */
const packageNames = readdirSync(path.join(monorepoRoot, 'packages'), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const vitestPackages = packageNames.filter((name) =>
  existsSync(path.join(monorepoRoot, 'packages', name, 'vitest.config.mts')),
);
const jestPackages = packageNames.filter(
  (name) => !vitestPackages.includes(name),
);

/**
 * Builds the test-file globs for a set of packages.
 *
 * @param names - The package directory names.
 * @returns Globs matching those packages' test files and test helpers.
 */
function testFilesIn(names: string[]): string[] {
  return names.flatMap((name) => [
    `packages/${name}/**/*.test.ts`,
    `packages/${name}/**/*.test.tsx`,
    `packages/${name}/**/test/**`,
    `packages/${name}/**/tests/**`,
  ]);
}

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
        'packages/wallet-cli/**',
        '**/scripts/**',
        'oxlint.config.ts',
        'jest.config.packages.cjs',
        'jest.config.scripts.cjs',
        'vitest.config.packages.mts',
        // These import their test-runner globals explicitly, so they need only
        // the Node environment.
        'tests/helpers.ts',
        'tests/matchers.ts',
        'tests/scripts-setup.ts',
        'tests/setupAfterEnv/**',
        'tests/shared-helpers.ts',
        'tests/vitest/**',
      ],
      extends: [nodejs],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
      },
    },

    {
      files: [
        'packages/*/jest.config.cjs',
        'packages/*/jest.config.e2e.cjs',
        'packages/*/jest.environment.cjs',
        'scripts/**/*.test.ts',
        ...testFilesIn(jestPackages),
      ],
      extends: [nodejs, jest],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
      },
    },

    {
      files: ['packages/advanced-chart-core/**'],
      env: { browser: true },
    },

    {
      files: [
        'tests/vitest/**',
        'vitest.config.packages.mts',
        'packages/*/vitest.config.mts',
        ...testFilesIn(vitestPackages),
      ],
      extends: [nodejs, vitest],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
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
  ],
});
