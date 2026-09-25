import base, { createConfig } from '@metamask/oxlint-config';
import commonjs from '@metamask/oxlint-config-commonjs';
import jest from '@metamask/oxlint-config-jest';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';

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
        '**/*.test.ts',
        '**/test/**',
        '**/tests/**',
      ],
      extends: [nodejs, jest],
      rules: {
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
      },
    },
  ],
});
