import base, { createConfig } from '@metamask/eslint-config';
import jest from '@metamask/eslint-config-jest';
import nodejs from '@metamask/eslint-config-nodejs';
import typescript from '@metamask/eslint-config-typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

const config = createConfig([
  ...base,
  {
    ignores: ['coverage/**', 'dist/**', 'docs/**', '.yarn/**'],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.{js,cjs,mjs}', '**/*.test.{js,ts}', '**/tests/**/*.{js,ts}'],
    extends: [nodejs],
  },
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2020,
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [typescript],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir,
      },
    },
  },
  {
    files: ['**/*.test.{js,ts}', '**/tests/**/*.{js,ts}'],
    extends: [jest],
  },
  // Project-wide rule overrides — placed AFTER all extends so they win.
  {
    rules: {
      // TODO: Fix jsdoc comments and re-enable these rules.
      'jsdoc/check-alignment': 'off',
      'jsdoc/check-types': 'off',
      'jsdoc/match-description': 'off',
      'jsdoc/require-asterisk-prefix': 'off',
      'jsdoc/require-description': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/prefer-enum-initializers': 'off',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      'no-restricted-syntax': 'off',
      // TODO: Re-enable these rules — they weren't enforced under the
      // legacy eslint-config v12 and surfacing them across the codebase
      // is out of scope for the v15 migration.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },
]);

export default config;
