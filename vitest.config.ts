import { defineConfig } from 'vitest/config';

/**
 * Runs every package's suite in one process with a shared worker pool. Use
 * `--project <name>` to pick packages. Coverage stays off here, because
 * thresholds are per package and a projects run has one coverage report; run
 * `yarn workspace <name> run test:coverage` for the gate.
 */
export default defineConfig({
  test: {
    watch: false,
    projects: ['packages/*/vitest.config.ts'],
  },
});
