import base, { createConfig } from '@metamask/eslint-config';
import jest from '@metamask/eslint-config-jest';
import nodejs from '@metamask/eslint-config-nodejs';
import typescript from '@metamask/eslint-config-typescript';
import nodePlugin from 'eslint-plugin-n';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

const config = createConfig([
  ...base,
  {
    ignores: [
      '**/.tsc-lint-cache',
      'coverage/**',
      'dist/**',
      'docs/**',
      '.yarn/**',
    ],
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
    // The package is ESM, so relative imports carry explicit `.js` specifiers.
    // These are the same three rules core configures for that, verbatim.
    // `import-x/extensions` does not support using ".js" for TypeScript
    // files(?), so we load the `n` plugin and use `n/file-extension-in-import`
    // instead.
    plugins: { n: nodePlugin },

    rules: {
      'n/file-extension-in-import': ['error', 'always'],
      'import-x/extensions': [
        'error',
        {
          js: 'ignorePackages',
          ts: 'never',
          tsx: 'never',
          json: 'always',
        },
      ],
      'import-x/no-useless-path-segments': [
        'error',
        {
          noUselessIndex: false,
        },
      ],
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
      // The rule treats the global `crypto` as experimental until Node 23,
      // and the supported floor here is ^22.14.0. It is present and usable
      // on 22, so the tests may use it.
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
]);

export default config;
