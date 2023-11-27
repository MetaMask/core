#!yarn ts-node

// A yargs application for creating new monorepo packages.
// Run `yarn create-package --help` for more information.

import yargs from 'yargs';

import { newPackage, defaultPackage } from './commands';

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
yargs
  .scriptName('create-package')
  .usage('$0 <cmd> [args]')
  .command(newPackage)
  .command(defaultPackage)
  .demandCommand(1, 'You must specify a command.')
  .strict()
  .help()
  .showHelpOnFail(false)
  .alias('help', 'h').argv;
