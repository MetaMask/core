import base, { createConfig } from '@metamask/oxlint-config';
import jest from '@metamask/oxlint-config-jest';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';

export default createConfig({
  ignorePatterns: ['.yarn'],
  extends: [base],

  options: {
    typeAware: true,
  },

  rules: {
    'eslint/id-length': 'off',
    'eslint/no-import-assign': 'off',
    'eslint/no-negated-condition': 'off',
    'eslint/no-new': 'off',
    'eslint/no-param-reassign': 'off',
    'eslint/no-shadow': 'off',
    'eslint/no-throw-literal': 'off',
    'eslint/no-unmodified-loop-condition': 'off',
    'eslint/no-unneeded-ternary': 'off',
    'eslint/no-unused-vars': 'off',
    'eslint/no-unsafe-optional-chaining': 'off',
    'eslint/prefer-promise-reject-errors': 'off',
    'eslint/radix': 'off',
    'import/extensions': 'off',
    'import/no-unassigned-import': 'off',
    'import/unambiguous': 'off',
    'jsdoc/check-tag-names': 'off',
    'jsdoc/require-param': 'off',
    'jsdoc/require-param-description': 'off',
    'jsdoc/require-returns': 'off',
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.mts', '**/*.cts'],
      extends: [typescript],
      rules: {
        'eslint/no-unused-vars': 'off',
        'typescript/explicit-function-return-type': 'off',
        'typescript/promise-function-async': 'off',
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
        'packages/*/jest.config.js',
        'packages/*/jest.config.e2e.js',
        'packages/*/jest.environment.js',
        '**/*.test.ts',
        '**/test/**',
        '**/tests/**',
      ],
      extends: [nodejs, jest],
      rules: {
        'jest/no-commented-out-tests': 'off',
        'jest/require-top-level-describe': 'off',
        'node/global-require': 'off',
        'node/no-sync': 'off',
        'node/no-process-env': 'off',
      },
    },
  ],
});
