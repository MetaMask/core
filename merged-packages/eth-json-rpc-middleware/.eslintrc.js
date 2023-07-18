module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
      rules: {
        // TODO: resolve warnings and remove to make into errors
        '@typescript-eslint/consistent-type-definitions': 'off',
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/prefer-optional-chain': 'warn',
        '@typescript-eslint/restrict-template-expressions': 'off',
        'id-denylist': 'off',
        'id-length': 'off',
        'import/no-nodejs-modules': 'off',
        'jsdoc/require-jsdoc': 'off',
        'jsdoc/require-param-description': 'warn',
        'jsdoc/require-hyphen-before-param-description': 'warn',
        'jsdoc/match-description': 'warn',
        'jsdoc/no-types': 'warn',
        'no-restricted-globals': 'off',
        'no-restricted-syntax': 'warn',
      },
    },

    {
      files: ['*.js'],
      parserOptions: {
        sourceType: 'script',
      },
      extends: ['@metamask/eslint-config-nodejs'],
    },

    {
      files: ['*.test.ts', '*.test.js', 'test/**/*.ts'],
      extends: ['@metamask/eslint-config-jest'],
      rules: {
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/unbound-method': 'off',
        'jest/expect-expect': [
          'error',
          {
            assertFunctionNames: [
              'expect',
              'expectProviderRequestNotToHaveBeenMade',
            ],
          },
        ],
        'jsdoc/check-param-names': 'off',
        'jsdoc/require-jsdoc': 'off',
        'jsdoc/require-param': 'off',
      },
    },
  ],

  ignorePatterns: ['!.eslintrc.js', '!.prettierrc.js', 'dist/'],
};
