module.exports = {
  root: true,
  extends: ['@metamask/eslint-config', '@metamask/eslint-config/config/jest', '@metamask/eslint-config/config/nodejs'],
  ignorePatterns: ['!.eslintrc.js', '!jest.config.js', 'node_modules', 'dist', 'docs', 'coverage', '*.d.ts'],
  overrides: [
    {
      files: ['*.js'],
      parserOptions: {
        ecmaVersion: '2018',
        sourceType: 'script',
      },
    },
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config/config/typescript'],
      rules: {
        // `no-shadow` has incompatibilities with TypeScript
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'error',

        // Prettier handles indentation. This rule conflicts with prettier in some cases
        '@typescript-eslint/indent': 'off',

        // disabled due to incompatibility with Record<string, unknown>
        // See https://github.com/Microsoft/TypeScript/issues/15300#issuecomment-702872440
        '@typescript-eslint/consistent-type-definitions': 'off',

        // TODO re-enable most of these rules
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/member-delimiter-style': [
          'error',
          {
            multiline: {
              delimiter: 'semi',
              requireLast: true,
            },
            singleline: {
              delimiter: 'semi',
              requireLast: false,
            },
          },
        ],
      },
    },
  ],
  rules: {
    'accessor-pairs': 'off',
    camelcase: 'off',
    'consistent-return': 'off',
    'default-case': 'off',
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
    'no-prototype-builtins': 'off',
    'no-useless-escape': 'off',
    radix: 'off',
    'require-atomic-updates': 'off',

    'jest/expect-expect': 'off',
    'jest/no-conditional-expect': 'off',
    'jest/no-restricted-matchers': 'off',
    'jest/no-test-return-statement': 'off',
    'jest/no-try-expect': 'off',
    'jest/prefer-strict-equal': 'off',
    'jest/require-to-throw-message': 'off',
    'jest/valid-expect-in-promise': 'off',
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
