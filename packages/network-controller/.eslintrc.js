module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['tests/provider-api-tests/*.ts'],
      extends: ['@metamask/eslint-config-jest'],
      rules: {
        // The helper files in this directory are used to define tests that
        // are executed in `create-network-client.test.ts`, and therefore some
        // of the usual rules that we have for Jest files don't apply here.
        'jest/no-export': 'off',
        'jest/no-identical-title': 'off',
        'jest/require-top-level-describe': 'off',
      },
    },
  ],
};
