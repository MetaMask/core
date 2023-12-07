/**
 * Entry point file for the `create-package` CLI.
 */

import cli from './cli';
import { commands } from './commands';

cli(process.argv, commands).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
