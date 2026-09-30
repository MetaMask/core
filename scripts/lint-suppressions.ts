/**
 * Entry point file for the `lint:suppressions` script.
 */

import { lintSuppressions } from './lib/lint-suppressions.ts';

await lintSuppressions(process.argv.slice(2));
