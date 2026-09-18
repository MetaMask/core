/**
 * Entry point file for the `create-package` CLI.
 */

import cli from './cli.js';
import { commands } from './commands.js';

cli(process.argv, commands).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
