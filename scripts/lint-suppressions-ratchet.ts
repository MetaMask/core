/**
 * Entry point file for the `lint:suppressions:ratchet` script.
 */

import { lintSuppressionsRatchet } from './lib/lint-suppressions-ratchet.ts';

await lintSuppressionsRatchet(process.argv.slice(2));
