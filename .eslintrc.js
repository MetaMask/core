module.exports = {
  root: true,
  extends: ['@metamask/eslint-config', '@metamask/eslint-config-nodejs'],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
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
    },
    {
      files: ['*.js'],
      parserOptions: {
        sourceType: 'script',
        ecmaVersion: '2018',
      },
    },
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
      rules: {
        // disabled due to incompatibility with Record<string, unknown>
        // See https://github.com/Microsoft/TypeScript/issues/15300#issuecomment-702872440
        '@typescript-eslint/consistent-type-definitions': 'off',

        // TODO: Move to `@metamask/eslint-config-typescript`.
        '@typescript-eslint/naming-convention': [
          'error',
          {
            selector: 'default',
            format: ['camelCase'],
            leadingUnderscore: 'allow',
            trailingUnderscore: 'forbid',
          },
          {
            selector: 'enumMember',
            format: ['PascalCase'],
          },
          {
            selector: 'interface',
            format: ['PascalCase'],
            custom: {
              regex: '^I[A-Z]',
              match: false,
            },
          },
          {
            selector: 'objectLiteralMethod',
            format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          },
          {
            selector: 'objectLiteralProperty',
            // Allow any casing for object literal properties.
            format: null,
          },
          {
            selector: 'typeLike',
            format: ['PascalCase'],
          },
          {
            selector: 'typeProperty',
            // We use `snake_case` sometimes, e.g., when working with API
            // responses.
            format: ['camelCase', 'snake_case'],
          },
          {
            selector: 'variable',
            format: ['camelCase', 'UPPER_CASE', 'PascalCase', 'snake_case'],
            leadingUnderscore: 'allow',
          },
        ],

        '@typescript-eslint/require-await': 'off',
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
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
