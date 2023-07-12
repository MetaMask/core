module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
      rules: {
        '@typescript-eslint/consistent-type-definitions': 'off',
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/unbound-method': 'warn',
        'id-denylist': 'off',
        'id-length': 'off',
        // TODO: Move this to our shared config
        'no-invalid-this': 'off',
        'no-restricted-syntax': 'off',
        '@typescript-eslint/no-invalid-this': ['error'],
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },

    {
      files: ['*.js'],
      extends: ['@metamask/eslint-config-nodejs'],
    },

    {
      files: ['*.test.ts', './tests/*.ts'],
      extends: ['@metamask/eslint-config-jest'],
      rules: {
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/no-throw-literal': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        'id-denylist': 'off',
        'import/no-nodejs-modules': 'off',
        'no-restricted-globals': 'off',
      },
    },
  ],

  ignorePatterns: ['!.eslintrc.js', '!.prettierrc.js', 'dist/'],
};
