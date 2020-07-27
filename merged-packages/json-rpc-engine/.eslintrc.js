module.exports = {
  root: true,

  parserOptions: {
    ecmaVersion: 2017,
  },

  plugins: [
    'json',
    'import',
  ],

  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/mocha',
    '@metamask/eslint-config/config/nodejs',
  ],

  rules: {
    'prefer-object-spread': 'off',
  },

  overrides: [{
    files: [
      '.eslintrc.js',
    ],
    parserOptions: {
      sourceType: 'script',
    },
  }],
}
