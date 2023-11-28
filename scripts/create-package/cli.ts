import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import commands from './commands';

/**
 * The entry point of a yargs application for creating new monorepo packages.
 *
 * @param argv - `process.argv`.
 */
export default async function cli(argv: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  yargs(hideBin(argv))
    .scriptName('create-package')
    // Disable --version. This is an internal tool and it doesn't have one.
    .version(false)
    .usage('$0 <cmd> [args]')
    // Typecast: the CommandModule<T, U>[] signature does in fact exist, but it is
    // missing from @types/yargs.
    .command(commands as any)
    .demandCommand(1, 'You must specify a command.')
    .strict()
    .showHelpOnFail(false)
    .help()
    .alias('help', 'h').argv;
}
