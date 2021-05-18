module.exports = {
  root: true,

  plugins: ['import'],

  extends: ['@metamask/eslint-config', '@metamask/eslint-config-nodejs'],

  rules: {
    'prefer-object-spread': 'off',
  },

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
    },
    {
      files: ['test/*'],
      extends: ['@metamask/eslint-config-mocha'],
    },
  ],

  ignorePatterns: ['!.eslintrc.js', '.nyc*', 'coverage/', 'dist/'],
};
