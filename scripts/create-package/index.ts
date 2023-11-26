#!yarn ts-node

import yargs from 'yargs';

import { newPackage, defaultPackage } from './commands';

(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  yargs
    .scriptName('create-package')
    .usage('$0 <cmd> [args]')
    .command(newPackage)
    .command(defaultPackage)
    .demandCommand(1, 'You must specify a command.')
    .strict()
    .help()
    .alias('help', 'h').argv;
})();
