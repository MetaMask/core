import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vitest/config';

const monorepoRoot = path.dirname(fileURLToPath(import.meta.url));

// A line that starts with a decorator, e.g. `@trackAssetsLoading`.
const DECORATOR_PATTERN = /^\s*@[A-Za-z_$][\w$]*/mu;

/**
 * Oxc, which Vitest uses to strip types, leaves standard (TC39) decorators in
 * place, and Node cannot run them. `AssetsController` in
 * `@metamask/assets-controller` uses one, so packages that load its source add
 * this plugin, which compiles any TypeScript module that uses a decorator with
 * TypeScript first. Remove it once Oxc lowers standard
 * decorators, see https://github.com/vitest-dev/vitest/issues/9876.
 *
 * @returns The Vite plugin.
 */
export function lowerDecorators(): Plugin {
  return {
    name: 'lower-decorators',
    enforce: 'pre',
    transform(code, id) {
      const fileName = id.split('?')[0] ?? id;
      if (!fileName.endsWith('.ts') || !DECORATOR_PATTERN.test(code)) {
        return null;
      }

      const { outputText, sourceMapText } = ts.transpileModule(code, {
        fileName,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
          target: ts.ScriptTarget.ES2022,
        },
      });

      return sourceMapText === undefined
        ? { code: outputText }
        : { code: outputText, map: sourceMapText };
    },
  };
}

/**
 * This configuration is extended by the `vitest.config.ts` configuration in
 * each package.
 *
 * For a detailed explanation of each option, visit:
 * https://vitest.dev/config/
 */
export default defineConfig({
  resolve: {
    // Apply the `paths` option from the package's `tsconfig.json`, which
    // resolves `@metamask/*` imports to the uncompiled source of packages that
    // live in this repo. Tests therefore need no build step, and the mapping
    // lives in one place instead of two.
    tsconfigPaths: true,
  },

  test: {
    // Vitest enables watch mode by default. We disable it here, so it can be
    // explicitly enabled with `yarn test:watch`.
    watch: false,

    // The files to include in the test run.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    // The setup files shared by every package.
    setupFiles: [
      path.join(monorepoRoot, 'tests/vitest/setup.ts'),
      path.join(monorepoRoot, 'tests/vitest/setup-after-env.ts'),
    ],

    // Reset mocks between tests, so a mocked implementation cannot leak from
    // one test into the next.
    mockReset: true,
    restoreMocks: true,

    typecheck: {
      enabled: true,
    },

    coverage: {
      // Coverage is opt in through the `test:coverage` script, which CI runs.
      enabled: false,

      // Configure the coverage provider. We use `istanbul` here, because it is
      // more stable than `v8`.
      provider: 'istanbul',

      // The files to include in the coverage report.
      include: ['src/**/*.ts'],

      // The files to exclude from the coverage report. An index file only
      // re-exports, so it has nothing to cover.
      exclude: ['src/**/index.ts', 'src/**/*.d.ts'],

      // `lcovonly` rather than `lcov`, which also writes a second HTML report.
      reporter: ['text', 'html', 'json-summary', 'lcovonly'],

      // Each package configures its own thresholds.
    },
  },
});
