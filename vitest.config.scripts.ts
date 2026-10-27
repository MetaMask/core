import path from 'node:path';
import { defineConfig } from 'vitest/config';

const monorepoRoot = import.meta.dirname;

/**
 * This configuration is used to test the scripts in `scripts/`.
 *
 * For a detailed explanation of each option, visit:
 * https://vitest.dev/config/
 */
export default defineConfig({
  resolve: {
    // Apply the `paths` option from the root `tsconfig.json`, which resolves
    // `@metamask/*` imports to the uncompiled source of packages that live in
    // this repo.
    tsconfigPaths: true,
  },

  test: {
    // Vitest enables watch mode by default. We disable it here, so it can be
    // explicitly enabled with `--watch`.
    watch: false,

    environment: 'node',

    // The files to include in the test run.
    include: ['scripts/**/*.test.ts'],

    // The package template is copied into new packages, and its tests are run
    // there.
    exclude: ['**/node_modules/**', 'scripts/**/package-template/**'],

    setupFiles: [path.join(monorepoRoot, 'tests/vitest/scripts-setup.ts')],

    // Reset mocks between tests, so a mocked implementation cannot leak from
    // one test into the next.
    mockReset: true,
    restoreMocks: true,

    coverage: {
      enabled: true,

      // Configure the coverage provider. We use `istanbul` here, because it is
      // more stable than `v8`.
      provider: 'istanbul',

      // The files to include in the coverage report.
      include: ['scripts/**/*.ts'],

      // The files to exclude from the coverage report.
      exclude: ['scripts/**/package-template/**'],

      reporter: ['text', 'html', 'json-summary'],

      reportsDirectory: 'scripts/coverage',

      thresholds: {
        'scripts/create-package/**/*.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
