import base, { createConfig } from '@metamask/eslint-config';
import jest from '@metamask/eslint-config-jest';
import nodejs from '@metamask/eslint-config-nodejs';
import typescript from '@metamask/eslint-config-typescript';

const config = createConfig([
  {
    ignores: ['dist/', 'docs/', '.yarn/'],
  },

  {
    extends: base,

    languageOptions: {
      sourceType: 'module',
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: ['./tsconfig.json'],
      },
    },

    settings: {
      'import-x/extensions': ['.js', '.mjs'],
    },
  },

  {
    files: ['**/*.ts'],
    extends: typescript,
    rules: {
      // TODO: These should perhaps be enabled
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      'no-restricted-syntax': 'off',
      // TODO: Thise should definitely be enabled
      '@typescript-eslint/naming-convention': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/consistent-type-definitions': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
    },
  },

  {
    files: ['**/*.js', '**/*.cjs'],
    extends: nodejs,

    languageOptions: {
      sourceType: 'script',
    },
  },

  {
    files: ['./test/**/*', '**/*.test.ts', '**/*.test.js'],
    extends: [jest, nodejs],
    rules: {
      'import-x/no-nodejs-modules': 'off',
    },
  },
]);

export default config;
