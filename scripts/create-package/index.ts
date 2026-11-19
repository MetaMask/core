/**
 * Entry point file for the `create-package` CLI.
 */

import cli from './cli.ts';
import { commands } from './commands.ts';

cli(process.argv, commands).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
