/**
 * Entry point file for the `lint:tsc:check` and `lint:tsc:suppress` scripts.
 */

import { lintTscSuppressions } from './lib/lint-tsc-suppressions.ts';

await lintTscSuppressions(process.argv.slice(2));
