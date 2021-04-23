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
    '*.d.ts',
  ],
  overrides: [
    {
      files: ['*.test.ts', '*.test.js'],
      extends: ['@metamask/eslint-config-jest'],
      rules: {
        // TODO: Re-enable these
        'jest/no-conditional-expect': 'off',
        'jest/no-test-return-statement': 'off',
      },
    },
    {
      files: ['*.js'],
      parserOptions: {
        sourceType: 'script',
      },
    },
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
      rules: {
        // `no-shadow` has incompatibilities with TypeScript
        // TODO: Migrate this into @metamask/eslint-config
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'error',

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
  ],
  rules: {
    // Left disabled because various properties throughough this repo are snake_case because the
    // names come from external sources or must comply with standards
    // e.g. `txreceipt_status`, `signTypedData_v4`, `token_id`
    'camelcase': 'off',

    // TODO: re-enble most of these rules
    'function-paren-newline': 'off',
    'guard-for-in': 'off',
    'implicit-arrow-linebreak': 'off',
    'import/no-anonymous-default-export': 'off',
    'import/no-unassigned-import': 'off',
    'lines-around-comment': 'off',
    'no-async-promise-executor': 'off',
    'no-case-declarations': 'off',
    'no-invalid-this': 'off',
    'no-negated-condition': 'off',
    'no-new': 'off',
    'no-param-reassign': 'off',
    'radix': 'off',
    'require-atomic-updates': 'off',
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
