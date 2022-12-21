module.exports = {
  extends: ['../../.eslintrc.js'],

  parserOptions: {
    tsconfigRootDir: __dirname,
  },

  rules: {
    '@typescript-eslint/no-shadow': 'off',
  },

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-browser'],
    },
    {
      files: ['*.test.ts'],
      extends: ['@metamask/eslint-config-nodejs'],
    },
  ],
};
