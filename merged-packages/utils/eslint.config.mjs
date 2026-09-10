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
    rules: {
      // Handled by Oxfmt.
      'prettier/prettier': 'off',
      'import-x/order': 'off',
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
  // Project-wide rule overrides. These go after every `extends` so they win.
  {
    rules: {
      // TODO: Re-enable these rules.
      // They were not enforced under the legacy eslint-config v12, and fixing
      // roughly 150 JSDoc blocks is out of scope for a config migration.
      // `require-jsdoc` in particular must stay off while suppressed: its
      // autofixer inserts empty `/** */` blocks and mangles surrounding code.
      // Core disables it for the same reason.
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },
  {
    files: ['**/*.test-d.ts'],
    rules: {
      // In `tsd` type tests the assertions carry the meaning of the test, so
      // the autofixer actively destroys them. Stripping `as any` from
      // `expectAssignable<Json>(null as any)`, for instance, deletes the very
      // thing that assertion exists to prove.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    files: ['**/*.test.{js,ts}'],
    rules: {
      // These tests deliberately reach for `crypto` and `crypto.webcrypto`,
      // and polyfill the global when running on Node 18. Flagging them as
      // unsupported defeats the purpose of the polyfill they are testing.
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
]);

export default config;
