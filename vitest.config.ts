import {
  createRootConfig,
  getPackageDirectories,
} from './scripts/lib/create-vitest-config.js';

/**
 * Runs every package's suite in one process with a shared worker pool. Use
 * `--project <name>` to pick packages. Coverage is off unless `--coverage` is
 * passed, and thresholds are only checked when merging sharded reports (see
 * `createRootConfig`); run `yarn workspace <name> run test` for a single
 * package's gate.
 */
export default createRootConfig(await getPackageDirectories());
