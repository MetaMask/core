module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: [
        'src/PermissionController.test.ts',
        'src/rpc-methods/revokePermissions.test.ts',
      ],
      rules: {
        // This is taken directly from @metamask/eslint-config-typescript@12.1.0
        '@typescript-eslint/naming-convention': [
          'error',
          // We have to disable the default selector, or it doesn't work.
          // {
          //   selector: 'default',
          //   format: ['camelCase'],
          //   leadingUnderscore: 'allow',
          //   trailingUnderscore: 'forbid',
          // },
          {
            selector: 'enumMember',
            format: ['PascalCase'],
          },
          {
            selector: 'interface',
            format: ['PascalCase'],
            custom: {
              regex: '^I[A-Z]',
              match: false,
            },
          },
          {
            selector: 'objectLiteralMethod',
            format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          },
          {
            selector: 'objectLiteralProperty',
            format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
            filter: {
              // Match RPC method names like foo_bar, foo_barBaz, etc., and metamask.io
              regex: '(^[a-z]+_[a-z]+[a-zA-Z0-9]*)|metamask\\.io$',
              match: false,
            },
          },
          {
            selector: 'typeLike',
            format: ['PascalCase'],
          },
          {
            selector: 'typeParameter',
            format: ['PascalCase'],
            custom: {
              regex: '^.{3,}',
              match: true,
            },
          },
          {
            selector: 'variable',
            format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
            leadingUnderscore: 'allow',
          },
          {
            selector: 'parameter',
            format: ['camelCase', 'PascalCase'],
            leadingUnderscore: 'allow',
          },
          {
            selector: [
              'classProperty',
              'objectLiteralProperty',
              'typeProperty',
              'classMethod',
              'objectLiteralMethod',
              'typeMethod',
              'accessor',
              'enumMember',
            ],
            format: null,
            modifiers: ['requiresQuotes'],
          },
        ],
      },
    },
  ],
};
