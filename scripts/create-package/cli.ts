import yargs from 'yargs';

import type { CommandModule } from './commands';

/**
 * The entry point of `create-package`, a yargs application for creating new
 * monorepo packages. See the repository contributor documentation for more
 * information.
 *
 * @param argv - The unmodified `process.argv`.
 * @param commands - The yargs command modules.
 */
export default async function cli(
  argv: string[],
  // Parameterized for easier testing.
  commands: CommandModule[],
) {
  await yargs(argv.slice(2))
    .scriptName('create-package')
    // Disable --version. This is an internal tool and it doesn't have a version.
    .version(false)
    .usage('$0 [args]')
    // @ts-expect-error: The CommandModule<T, U>[] signature does in fact exist,
    // but it is missing from our yargs types.
    .command(commands)
    .strict()
    .check((args) => {
      // Trim all strings and ensure they are not empty.
      for (const key in args) {
        if (typeof args[key] === 'string') {
          args[key] = (args[key] as string).trim();

          if (args[key] === '') {
            throw new Error(
              `The argument "${key}" was processed to an empty string. Please provide a value with non-whitespace characters.`,
            );
          }
        }
      }

      return true;
    }, true) // `true` indicating that this check should be enabled for all commands and sub-commands.
    .showHelpOnFail(false)
    .help()
    .alias('help', 'h')
    // @ts-expect-error: This does in fact exist, but it is missing from our yargs types.
    .parseAsync();
}
