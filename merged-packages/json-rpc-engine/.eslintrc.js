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
    '@metamask/eslint-config/config/typescript',
  ],

  rules: {
    'prefer-object-spread': 'off',
  },

  overrides: [{
    files: [
      '*.js',
      '*.json',
    ],
    parserOptions: {
      sourceType: 'script',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  }],

  ignorePatterns: [
    '!.eslintrc.js',
    '.nyc*',
    'coverage/',
    'dist/',
  ],
};
