import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import commands from './commands';

/**
 * The entry point of a yargs application for creating new monorepo packages.
 *
 * @param argv - The unmodified `process.argv`.
 */
export default async function cli(argv: string[]) {
  await yargs(hideBin(argv))
    .scriptName('create-package')
    // Disable --version. This is an internal tool and it doesn't have one.
    .version(false)
    .usage('$0 <cmd> [args]')
    // Typecast: the CommandModule<T, U>[] signature does in fact exist, but it is
    // missing from our yargs types.
    .command(commands as any)
    .demandCommand(1, 'You must specify a command.')
    .strict()
    .showHelpOnFail(false)
    .help()
    .alias('help', 'h')
    // @ts-expect-error: This is missing from our yargs types.
    .parseAsync();
}
