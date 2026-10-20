import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const monorepoRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * This configuration is used by tests for scripts and other files outside of
 * monorepo packages.
 *
 * For a detailed explanation of each option, visit:
 * https://vitest.dev/config/
 */
export default defineConfig({
  resolve: {
    // Apply the `paths` option from the root `tsconfig.json`, which resolves
    // `@metamask/*` imports to the uncompiled source of packages that live in
    // this repo. Tests therefore need no build step, and the mapping lives in
    // one place instead of two.
    tsconfigPaths: true,
  },

  test: {
    // Vitest enables watch mode by default. We disable it here, so it can be
    // explicitly enabled with `yarn test:watch`.
    watch: false,

    // The files to include in the test run.
    include: ['.oxlint-plugins/**/*.test.ts'],

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

      include: ['.oxlint-plugins/**/*.test-d.ts'],
    },

    coverage: {
      enabled: true,

      // Configure the coverage provider. We use `istanbul` here, because it is
      // more stable than `v8`.
      provider: 'istanbul',

      // The files to include in the coverage report.
      include: ['.oxlint-plugins/**/*.ts'],

      // The files to exclude from the coverage report. An index file only
      // re-exports, so it has nothing to cover.
      exclude: [
        // The plugin entrypoint only registers rules, so there is no logic to
        // test; each rule is tested on its own.
        '.oxlint-plugins/metamask-core.ts',
      ],

      // `lcovonly` rather than `lcov`, which also writes a second HTML report.
      reporter: ['text', 'html', 'json-summary', 'lcovonly'],

      thresholds: {
        '.oxlint-plugins/**/*.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
