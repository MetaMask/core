/**
 * Entry point file for the `lint:tsc:check` and `lint:tsc:suppress` scripts.
 */

import { lintTsc } from './lib/lint-tsc.js';

lintTsc(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
