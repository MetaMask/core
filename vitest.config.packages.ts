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
      enabled: true,

      // Configure the coverage provider. We use `istanbul` here, because it is
      // more stable than `v8`.
      provider: 'istanbul',

      // The files to include in the coverage report.
      include: ['src/**/*.ts'],

      // The files to exclude from the coverage report. Index files are
      // measured like any other source; a package that needs an exception
      // adds it to its own config with a reason.
      exclude: ['src/**/*.d.ts'],

      // `lcovonly` rather than `lcov`, which also writes a second HTML report.
      reporter: ['text', 'html', 'json-summary', 'lcovonly'],

      // Each package configures its own thresholds.
    },
  },
});
