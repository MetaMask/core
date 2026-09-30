/**
 * Entry point file for the `lint:tsc:check` and `lint:tsc:suppress` scripts.
 */

import { lintTsc } from './lib/lint-tsc.ts';

await lintTsc(process.argv.slice(2));
