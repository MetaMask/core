import base from '@metamask/eslint-config';
import nodejs from '@metamask/eslint-config-nodejs';
import jest from '@metamask/eslint-config-jest';
import typescript from '@metamask/eslint-config-typescript';
import tseslint from 'typescript-eslint';

const config = tseslint.config({
  ignores: [
    '!.eslint.config.mjs',
    '!jest.config.js',
    'yarn.lock',
    '**/*.d.ts',
    '**/**.map',
    '**/dist/**',
    '**/docs/**',
    '**/coverage/**',
    'merged-packages/**',
    'scripts/create-package/package-template/**',
  ],
},
{
  extends: [...base, ...nodejs],
  rules: {
    // Left disabled because various properties throughough this repo are snake_case because the
    // names come from external sources or must comply with standards
    // e.g. `txreceipt_status`, `signTypedData_v4`, `token_id`
    camelcase: 'off',
    'id-length': 'off',

    // TODO: re-enble most of these rules
    '@typescript-eslint/naming-convention': 'off',
    'function-paren-newline': 'off',
    'id-denylist': 'off',
    'implicit-arrow-linebreak': 'off',
    'import/no-anonymous-default-export': 'off',
    'import/no-unassigned-import': 'off',
    'lines-around-comment': 'off',
    'n/no-sync': 'off',
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
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
    jsdoc: {
      mode: 'typescript',
    },
  },
},
{
  files: ['*.test.{ts,js}', '**/tests/**/*.{ts,js}'],
  extends: jest,
},
{
  // These files are test helpers, not tests. We still use the Jest ESLint
  // config here to ensure that ESLint expects a test-like environment, but
  // various rules meant just to apply to tests have been disabled.
  files: ['**/tests/**/*.{ts,js}', '!*.test.{ts,js}'],
  rules: {
    'jest/no-export': 'off',
    'jest/require-top-level-describe': 'off',
    'jest/no-if': 'off',
  },
},
{
  files: ['*.js', '*.cjs'],
  languageOptions: {
    parserOptions: {
      sourceType: 'script',
      ecmaVersion: '2020',
    },
  },
},
{
  files: ['*.ts'],
  extends: typescript,
  languageOptions: {
    parserOptions: {
      project: ['./tsconfig.packages.json'],
    },
  },
  rules: {
    // Enable rules that are disabled in `@metamask/eslint-config-typescript`
    '@typescript-eslint/no-explicit-any': 'error',

    // TODO: auto-fix breaks stuff
    '@typescript-eslint/promise-function-async': 'off',

    // TODO: re-enable most of these rules
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/prefer-enum-initializers': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/prefer-reduce-type-parameter': 'off',
    'no-restricted-syntax': 'off',
    'no-restricted-globals': 'off',
  },
},
{
  files: ['tests/setupAfterEnv/matchers.ts'],
  languageOptions: {
    parserOptions: {
      sourceType: 'script',
    },
  },
},
{
  files: ['*.d.ts'],
  rules: {
    '@typescript-eslint/naming-convention': 'warn',
    'import/unambiguous': 'off',
  },
},
{
  files: ['scripts/*.ts'],
  extends: nodejs,
  rules: {
    // All scripts will have shebangs.
    'n/shebang': 'off',
  },
},
{
  files: ['**/jest.environment.js'],
  extends: nodejs,
  rules: {
    // These files run under Node, and thus `require(...)` is expected.
    'n/global-require': 'off',
  },
});

export default config;
