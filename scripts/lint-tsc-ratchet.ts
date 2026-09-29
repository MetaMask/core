/**
 * Entry point file for the `lint:tsc:ratchet` script.
 */

import { lintTscRatchet } from './lib/lint-tsc-ratchet.ts';

await lintTscRatchet(process.argv.slice(2));
