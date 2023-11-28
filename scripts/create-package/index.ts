/**
 * Entry point file for the create-package CLI.
 */

import cli from './cli';

cli(process.argv).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
