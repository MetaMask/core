import base, { createConfig } from '@metamask/eslint-config';
import jest from '@metamask/eslint-config-jest';
import nodejs from '@metamask/eslint-config-nodejs';
import typescript from '@metamask/eslint-config-typescript';

const NODE_LTS_VERSION = 22;

const config = createConfig([
  ...base,
  {
    ignores: [
      '**/dist/**',
      '**/docs/**',
      '**/coverage/**',
      'merged-packages/**',
      '.yarn/**',
      'scripts/create-package/package-template/**',
      '.messenger-docs/**',
      'packages/messenger-docs/template/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    rules: {
      // TODO: Re-enable this rule
      // Enabling it with error suppression breaks `--fix`, because the autofixer for this rule
      // does not work very well.
      'jsdoc/require-jsdoc': 'off',
    },
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
  },
  {
    files: [
      '**/*.{js,cjs,mjs}',
      '**/*.test.{js,ts}',
      '**/test/**/*.{js,ts}',
      '**/tests/**/*.{js,ts}',
      'scripts/*.ts',
      'scripts/create-package/**/*.ts',
      'packages/messenger-docs/src/**/*.ts',
    ],
    extends: [nodejs],
  },
  {
    files: ['packages/messenger-docs/src/cli.ts'],
    rules: {
      // The bin field points to dist/cli.mjs but the source is src/cli.ts.
      // Without convertPath, n/hashbang cannot correlate the two.
      'n/hashbang': 'off',
    },
  },
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2020,
    },
  },
  {
    files: ['**/*.ts'],
    extends: [typescript],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TODO: Disable in `eslint-config-typescript`, tracked here: https://github.com/MetaMask/eslint-config/issues/413
      '@typescript-eslint/no-unnecessary-type-arguments': 'off',

      // This rule does not detect multiple imports of the same file where types
      // are being imported in one case and runtime values are being imported in
      // another
      'import-x/no-duplicates': 'off',

      // Enable rules that are disabled in `@metamask/eslint-config-typescript`
      '@typescript-eslint/no-explicit-any': 'error',

      // TODO: auto-fix breaks stuff
      '@typescript-eslint/promise-function-async': 'off',

      // TODO: Re-enable these rules
      // Enabling them with error suppression breaks `--fix`, because the autofixer for these rules
      // do not work very well.
      'jsdoc/check-tag-names': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
  {
    files: ['**/*.test.{js,ts}', '**/tests/**/*.{js,ts}'],
    extends: [jest],
    rules: {
      // TODO: Upgrade these from warning to error in shared config
      'jest/expect-expect': 'error',
      'jest/no-alias-methods': 'error',
      'jest/no-commented-out-tests': 'error',
      'jest/no-disabled-tests': 'error',
    },
    settings: {
      node: {
        version: `^${NODE_LTS_VERSION}`,
      },
    },
  },
  {
    // These files are test helpers, not tests. We still use the Jest ESLint
    // config here to ensure that ESLint expects a test-like environment, but
    // various rules meant just to apply to tests have been disabled.
    files: ['**/tests/**/*.{js,ts}'],
    ignores: ['**/*.test.{js,ts}'],
    rules: {
      'jest/no-export': 'off',
      'jest/require-top-level-describe': 'off',
      'jest/no-if': 'off',
    },
  },
  {
    files: ['tests/setupAfterEnv/matchers.ts'],
    languageOptions: {
      sourceType: 'script',
    },
  },
  // This should really be in `@metamask/eslint-config-typescript`
  {
    files: ['**/*.d.ts'],
    rules: {
      'import-x/unambiguous': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      // Scripts may be self-executable and thus have hashbangs.
      'n/hashbang': 'off',
    },
  },
  {
    files: ['**/jest.environment.js'],
    rules: {
      // These files run under Node, and thus `require(...)` is expected.
      'n/global-require': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['packages/foundryup/**/*.{js,ts}'],
    rules: {
      'import-x/no-nodejs-modules': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'n/no-missing-import': 'off',
      'n/no-restricted-import': 'off',
      'n/no-deprecated-api': 'off',
    },
  },
  {
    files: [
      'packages/notification-services-controller/src/NotificationServicesPushController/services/push/*-web.ts',
      'packages/notification-services-controller/src/NotificationServicesPushController/web/**/*.ts',
    ],
    rules: {
      // These files use `self` because they're written for a service worker context.
      // TODO: Move these files to the extension repository, `core` is just for platform-agnostic code.
      'consistent-this': 'off',
    },
  },
  {
    files: [
      'packages/assets-controllers/src/NftDetectionController.ts',
      'packages/assets-controllers/src/TokenRatesController.ts',
      'packages/assets-controllers/src/TokensController.ts',
      'packages/controller-utils/src/siwe.ts',
      'packages/ens-controller/src/EnsController.ts',
      'packages/gas-fee-controller/src/GasFeeController.ts',
      'packages/logging-controller/src/LoggingController.ts',
      'packages/message-manager/src/AbstractMessageManager.ts',
      'packages/message-manager/src/DecryptMessageManager.ts',
      'packages/message-manager/src/EncryptionPublicKeyManager.ts',
      'packages/permission-log-controller/src/PermissionLogController.ts',
      'packages/phishing-controller/src/PhishingController.ts',
      'packages/rate-limit-controller/src/RateLimitController.ts',
      'tests/fake-provider.ts',
      'tests/mock-network.ts',
    ],
    rules: {
      // TODO: Re-enable this rule
      // This has been temporarily disabled because the auto-fix mangles pre-existing JSDoc blocks
      // for types that don't follow TSDoc properly.
      // See https://github.com/gajus/eslint-plugin-jsdoc/issues/1054
      'jsdoc/check-tag-names': 'off',
    },
  },
]);

export default config;
