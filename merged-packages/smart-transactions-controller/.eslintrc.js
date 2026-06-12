module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
      rules: {
        '@typescript-eslint/naming-convention': 0,
        '@typescript-eslint/no-floating-promises': 1,
        '@typescript-eslint/prefer-enum-initializers': 0,
        '@typescript-eslint/restrict-template-expressions': 1,
        'no-restricted-syntax': 0,
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
      files: ['*.test.ts', '*.test.js'],
      extends: ['@metamask/eslint-config-jest'],
    },
  ],

  rules: {
    // TODO: Fix jsdoc comments and enable rules
    'jsdoc/check-alignment': 0,
    'jsdoc/check-types': 0,
    'jsdoc/match-description': 0,
    'jsdoc/newline-after-description': 0,
    'jsdoc/require-asterisk-prefix': 0,
    'jsdoc/require-description': 0,
    'jsdoc/require-jsdoc': 0,
    'jsdoc/require-param': 0,
    'jsdoc/require-param-description': 0,
    'jsdoc/require-returns': 0,
    'jsdoc/require-returns-description': 0,
  },

  ignorePatterns: ['!.eslintrc.js', '!.prettierrc.js', 'dist/'],
};
