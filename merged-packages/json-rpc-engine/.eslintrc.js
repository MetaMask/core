module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
    },

    {
      files: ['*.js'],
      parserOptions: {
        sourceType: 'script',
      },
      extends: ['@metamask/eslint-config-nodejs'],
    },

    {
      files: ['test/*'],
      extends: ['@metamask/eslint-config-mocha'],
      parserOptions: {
        ecmaVersion: 2020,
      },
    },
  ],

  ignorePatterns: ['!.eslintrc.js', '.nyc*', 'coverage/', 'dist/'],
};
