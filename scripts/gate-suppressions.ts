/**
 * Entry point file for the `suppressions:gate` script.
 */

import { gateSuppressions } from './lib/gate-suppressions.ts';

await gateSuppressions(process.argv.slice(2));
