/**
 * Entry point file for the `lint:tsc:ratchet` script.
 */

import { lintTscRatchet } from './lib/lint-tsc-ratchet.js';

lintTscRatchet(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
