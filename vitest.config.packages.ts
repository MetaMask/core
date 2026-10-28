import path from 'node:path';
import { defineConfig } from 'vitest/config';

const monorepoRoot = import.meta.dirname;

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
    setupFiles: [path.join(monorepoRoot, 'tests/vitest/setup-after-env.ts')],

    // Reset mocks between tests, so a mocked implementation cannot leak from
    // one test into the next.
    mockReset: true,
    restoreMocks: true,

    unstubGlobals: true,

    typecheck: {
      enabled: true,
    },

    coverage: {
      // Coverage is opt in through the `test:coverage` script, which CI runs.
      enabled: false,

      // We use `istanbul` because on 2026-10-25 `v8` was only about 5% faster
      // across six sample packages and made the crypto heavy tests in
      // keyring-controller and profile-sync-controller time out.
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
