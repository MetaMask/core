import base, { createConfig } from '@metamask/oxlint-config';
import jest from '@metamask/oxlint-config-jest';
import nodejs from '@metamask/oxlint-config-nodejs';
import typescript from '@metamask/oxlint-config-typescript';

export default createConfig({
  ignorePatterns: ['.yarn'],
  extends: [base],

  options: {
    reportUnusedDisableDirectives: 'error',
    typeAware: true,
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.mts', '**/*.cts'],
      extends: [typescript],
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
