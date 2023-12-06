import type { CommandModule } from 'yargs';
import yargs from 'yargs';

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
  commands: CommandModule<any, any>[],
) {
  await yargs(argv.slice(2))
    .scriptName('create-package')
    // Disable --version. This is an internal tool and it doesn't have one.
    .version(false)
    .usage('$0 <cmd> [args]')
    // Typecast: the CommandModule<T, U>[] signature does in fact exist, but it is
    // missing from our yargs types.
    .command(commands as any)
    .demandCommand(
      1,
      1,
      'You must specify a command. See --help.',
      'You may not specify more than one command. See --help.',
    )
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
    }, true) // `true` indicating that this check should be enabled for everything.
    .showHelpOnFail(false)
    .help()
    .alias('help', 'h')
    .parseAsync();
}
