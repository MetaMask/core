module.exports = {
  root: true,
  extends: ['@metamask/eslint-config', '@metamask/eslint-config-nodejs'],
  ignorePatterns: [
    '!.eslintrc.js',
    '!jest.config.js',
    'node_modules',
    'dist',
    'docs',
    'coverage',
    'scripts',
    'tests',
  ],
  overrides: [
    {
      files: ['*.test.{ts,js}', '**/tests/**/*.{ts,js}'],
      extends: ['@metamask/eslint-config-jest'],
    },
    {
      // These files are test helpers, not tests. We still use the Jest ESLint
      // config here to ensure that ESLint expects a test-like environment, but
      // various rules meant just to apply to tests have been disabled.
      files: ['**/tests/**/*.{ts,js}', '!*.test.{ts,js}'],
      rules: {
        '@typescript-eslint/naming-convention': 'off',
        'jest/no-export': 'off',
        'jest/require-top-level-describe': 'off',
        'jest/no-if': 'off',
        'jest/no-test-return-statement': 'off',
        // TODO: Re-enable this rule; we can accomodate this even in our test helpers
        'jest/expect-expect': 'off',
      },
    },
    {
      files: ['*.js'],
      parserOptions: {
        project: ['./tsconfig.packages.json'],
        sourceType: 'script',
        ecmaVersion: '2018',
      },
    },
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
      parserOptions: {
        project: ['./tsconfig.packages.json'],
      },
      rules: {
        // disabled due to incompatibility with Record<string, unknown>
        // See https://github.com/Microsoft/TypeScript/issues/15300#issuecomment-702872440
        '@typescript-eslint/consistent-type-definitions': 'off',

        // Modified to include the 'ignoreRestSiblings' option
        // TODO: Migrate this rule change back into `@metamask/eslint-config`
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            vars: 'all',
            args: 'all',
            argsIgnorePattern: '[_]+',
            ignoreRestSiblings: true,
          },
        ],
      },
    },
    {
      files: ['*.d.ts'],
      rules: {
        'import/unambiguous': 'off',
      },
    },
    {
      files: ['scripts/*.ts'],
      rules: {
        // All scripts will have shebangs.
        'node/shebang': 'off',
      },
    },
  ],
  rules: {
    // Left disabled because various properties throughough this repo are snake_case because the
    // names come from external sources or must comply with standards
    // e.g. `txreceipt_status`, `signTypedData_v4`, `token_id`
    camelcase: 'off',

    // TODO: re-enble most of these rules
    '@typescript-eslint/naming-convention': 'warn',
    'function-paren-newline': 'off',
    'guard-for-in': 'off',
    'id-denylist': 'off',
    'implicit-arrow-linebreak': 'off',
    'import/no-anonymous-default-export': 'off',
    'import/no-unassigned-import': 'off',
    'jsdoc/match-description': 'warn',
    'lines-around-comment': 'off',
    'no-async-promise-executor': 'off',
    'no-case-declarations': 'off',
    'no-invalid-this': 'off',
    'no-negated-condition': 'off',
    'no-new': 'off',
    'no-param-reassign': 'off',
    radix: 'off',
    'require-atomic-updates': 'off',
    'jsdoc/match-description': [
      'warn',
      { matchDescription: '^[A-Z`\\d_][\\s\\S]*[.?!`>)}]$' },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
