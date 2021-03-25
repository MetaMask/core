module.exports = {
  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/nodejs',
  ],

  parserOptions: {
    ecmaVersion: 2017,
  },

  plugins: [
    'json',
  ],

  overrides: [
    {
      files: ['*.ts'],
      extends: [
        '@metamask/eslint-config/config/typescript',
      ],
      rules: {
        'spaced-comment': ['error', 'always', { 'markers': ['/'] }],
      },
    },
    {
      files: [
        '*.js',
        '*.json',
      ],
      parserOptions: {
        sourceType: 'script',
      },
      extends: [
        '@metamask/eslint-config/config/nodejs',
      ],
    },
  ],

  ignorePatterns: [
    '!.eslintrc.js',
    'dist/',
  ],
};
