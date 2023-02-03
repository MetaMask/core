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
  ],
  overrides: [
    {
      files: [
        '*.test.ts',
        '*.test.js',
        './packages/network-controller/src/provider-api-tests/**/*.ts',
      ],
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
    // This is already set in the newest version of eslint-config
    'padding-line-between-statements': [
      'error',
      {
        blankLine: 'always',
        prev: 'directive',
        next: '*',
      },
      {
        blankLine: 'any',
        prev: 'directive',
        next: 'directive',
      },
    ],

    // Left disabled because various properties throughough this repo are snake_case because the
    // names come from external sources or must comply with standards
    // e.g. `txreceipt_status`, `signTypedData_v4`, `token_id`
    camelcase: 'off',

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
    radix: 'off',
    'require-atomic-updates': 'off',
    'jsdoc/match-description': [
      'error',
      { matchDescription: '^[A-Z`\\d_][\\s\\S]*[.?!`>)}]$' },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
