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
    ],
  },
  {
    rules: {
      // Left disabled because various properties throughough this repo are snake_case because the
      // names come from external sources or must comply with standards
      // e.g. `txreceipt_status`, `signTypedData_v4`, `token_id`
      camelcase: 'off',
      'id-length': 'off',

      // TODO: re-enble most of these rules
      'function-paren-newline': 'off',
      'id-denylist': 'off',
      'implicit-arrow-linebreak': 'off',
      'import-x/no-anonymous-default-export': 'off',
      'import-x/no-unassigned-import': 'off',
      'lines-around-comment': 'off',
      'no-async-promise-executor': 'off',
      'no-case-declarations': 'off',
      'no-invalid-this': 'off',
      'no-negated-condition': 'off',
      'no-new': 'off',
      'no-param-reassign': 'off',
      'no-restricted-syntax': 'off',
      radix: 'off',
      'require-atomic-updates': 'off',
      'jsdoc/match-description': [
        'off',
        { matchDescription: '^[A-Z`\\d_][\\s\\S]*[.?!`>)}]$' },
      ],

      // TODO: These rules created more errors after the upgrade to ESLint 9.
      // Re-enable these rules and address any lint violations.
      'import-x/no-named-as-default-member': 'warn',
      'prettier/prettier': 'warn',
      'no-empty-function': 'warn',
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
    ],
    extends: [nodejs],
    rules: {
      // TODO: Re-enable this
      'n/no-sync': 'off',
      // TODO: These rules created more errors after the upgrade to ESLint 9.
      // Re-enable these rules and address any lint violations.
      'n/no-unsupported-features/node-builtins': 'warn',
    },
  },
  {
    files: ['**/*.test.{js,ts}', '**/tests/**/*.{js,ts}'],
    extends: [jest],
    rules: {
      // TODO: These rules created more errors after the upgrade to ESLint 9.
      // Re-enable these rules and address any lint violations.
      'jest/no-conditional-in-test': 'warn',
      'jest/prefer-lowercase-title': 'warn',
      'jest/prefer-strict-equal': 'warn',
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
        project: './tsconfig.packages.json',
        // Disable `projectService` because we run into out-of-memory issues.
        // See this ticket for inspiration out how to solve this:
        // <https://github.com/typescript-eslint/typescript-eslint/issues/1192>
        projectService: false,
      },
    },
    rules: {
      // These rules have been customized from their defaults.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          considerDefaultExhaustiveForUnions: true,
        },
      ],

      // This rule does not detect multiple imports of the same file where types
      // are being imported in one case and runtime values are being imported in
      // another
      'import-x/no-duplicates': 'off',

      // Enable rules that are disabled in `@metamask/eslint-config-typescript`
      '@typescript-eslint/no-explicit-any': 'error',

      // TODO: auto-fix breaks stuff
      '@typescript-eslint/promise-function-async': 'off',

      // TODO: re-enable most of these rules
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/prefer-enum-initializers': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',

      // TODO: These rules created more errors after the upgrade to ESLint 9.
      // Re-enable these rules and address any lint violations.
      '@typescript-eslint/consistent-type-exports': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-duplicate-enum-values': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'warn',
      '@typescript-eslint/prefer-readonly': 'warn',
      'import-x/namespace': 'warn',
      'import-x/no-named-as-default': 'warn',
      'import-x/order': 'warn',
      'jsdoc/check-tag-names': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/tag-lines': 'warn',
      'no-unused-private-class-members': 'warn',
      'promise/always-return': 'warn',
      'promise/catch-or-return': 'warn',
      'promise/param-names': 'warn',
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
      '@typescript-eslint/naming-convention': 'warn',
      'import-x/unambiguous': 'off',
    },
  },
  {
    files: ['scripts/*.ts'],
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

      // TODO: These rules created more errors after the upgrade to ESLint 9.
      // Re-enable these rules and address any lint violations.
      'n/prefer-global/text-encoder': 'warn',
      'n/prefer-global/text-decoder': 'warn',
      'no-shadow': 'warn',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['packages/eth-block-tracker/**/*.ts'],
    rules: {
      // TODO: Re-enable these rules or add inline ignores for warranted cases
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      'no-restricted-syntax': 'warn',
      '@typescript-eslint/naming-convention': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/consistent-type-definitions': 'warn',
    },
  },
  {
    files: ['packages/eth-json-rpc-middleware/**/*.ts'],
    rules: {
      // TODO: Re-enable these rules or add inline ignores for warranted cases
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      'jsdoc/match-description': 'warn',
      'jsdoc/require-jsdoc': 'warn',
      'no-restricted-syntax': 'warn',
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
]);

export default config;
