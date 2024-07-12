module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: [
        'src/PermissionController.test.ts',
        'src/rpc-methods/revokePermissions.test.ts',
      ],
      rules: {
        '@typescript-eslint/naming-convention': [
          'error',
          {
            selector: 'objectLiteralProperty',
            format: ['camelCase', 'UPPER_CASE'],
            leadingUnderscore: 'allow',
            filter: {
              regex: '^[a-z][a-zA-Z0-9]*_w+$',
              match: true,
            },
          },
          {
            selector: 'objectLiteralProperty',
            format: null,
            modifiers: ['requiresQuotes'],
          },
        ],
      },
    },
  ],
};
