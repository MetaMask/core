module.exports = {
  root: true,

  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/nodejs',
  ],

  parserOptions: {
    ecmaVersion: 2017,
    ecmaFeatures: {
      arrowFunctions: true,
      classes: true,
    },
  },

  overrides: [{
    files: [
      '.eslintrc.js',
    ],
    parserOptions: {
      sourceType: 'script',
    },
  }, {
    files: ['test/index.js'],
    rules: {
      'import/no-unresolved': 'off'
    },
  }],

  ignorePatterns: ['dist'],
}
