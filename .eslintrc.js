module.exports = {
  root: true,
  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/jest',
    '@metamask/eslint-config/config/nodejs',
    '@metamask/eslint-config/config/typescript',
  ],
  ignorePatterns: [
    '!.eslintrc.js',
    '!jest.config.js',
    'node_modules',
    'dist',
    'docs',
    'coverage',
    '*.d.ts',
  ],
  overrides: [{
    files: ['*.js'],
    parserOptions: {
      sourceType: 'script',
    },
  }],
  rules: {
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    '@typescript-eslint/indent': 'off',

    // TODO re-enable most of these rules
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/member-delimiter-style': [
      'error',
      {
        'multiline': {
          'delimiter': 'semi',
          'requireLast': true,
        },
        'singleline': {
          'delimiter': 'semi',
          'requireLast': false,
        },
      },
    ],
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/space-before-function-paren': [
      'error',
      {
        'anonymous': 'always',
        'named': 'never',
        'asyncArrow': 'always',
      },
    ],

    'camelcase': 'off',
    'consistent-return': 'off',
    'default-case': 'off',
    'function-paren-newline': 'off',
    'guard-for-in': 'off',
    'implicit-arrow-linebreak': 'off',
    'import/no-anonymous-default-export': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/no-unassigned-import': 'off',
    'lines-around-comment': 'off',
    'no-async-promise-executor': 'off',
    'no-case-declarations': 'off',
    'no-invalid-this': 'off',
    'no-negated-condition': 'off',
    'no-new': 'off',
    'no-param-reassign': 'off',
    'no-prototype-builtins': 'off',
    'no-useless-escape': 'off',
    'radix': 'off',
    'require-atomic-updates': 'off',

    'jest/expect-expect': 'off',
    'jest/no-test-return-statement': 'off',
    'jest/no-truthy-falsy': 'off',
    'jest/no-try-expect': 'off',
    'jest/prefer-strict-equal': 'off',
    'jest/require-to-throw-message': 'off',
    'jest/valid-expect-in-promise': 'off',
  },
};
