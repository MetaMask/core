import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { newPackage, defaultPackage } from './commands';

/**
 * The entry point of a yargs application for creating new monorepo packages.
 *
 * @param argv - `process.argv`.
 */
export default async function cli(argv: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  yargs(hideBin(argv))
    .scriptName('create-package')
    .usage('$0 <cmd> [args]')
    .command(newPackage)
    .command(defaultPackage)
    .demandCommand(1, 'You must specify a command.')
    .strict()
    .showHelpOnFail(false)
    .help()
    .alias('help', 'h').argv;
}
