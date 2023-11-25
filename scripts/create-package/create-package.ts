import type { Argv, CommandModule, Arguments } from 'yargs';

/**
 * ```
 * TODO
 * - References in tsconfig.json and tsconfig.build.json
 *  - We could prompt the user about their intra-monorepo dependencies
 *  - This would help with dependencies and peerDependencies also
 * - License options
 *   - If not MIT, create empty license file for now -> Y
 * - Option for just some defaults? -> Y
 *
 * Placeholders:
 *
 * CURRENT_YEAR
 * NODE_VERSION
 * PACKAGE_NAME
 * PACKAGE_DESCRIPTION
 * PACKAGE_DIRECTORY_NAME
 *
 * Plan:
 * - Get cwd
 * - Create function for getting all the remaining package data (placeholders)
 *   - By prompting the user, except:
 *     - CURRENT_YEAR, NODE_VERSION (.nvrmc)
 * - Read and modify all the relevant monorepo files (like tsconfig etc.)
 *   - tsconfig.json, tsconfig.build.json
 * - Read and modify all the relevant template files
 *   - We can just do a simple string replace on all of them for the placeholders.
 *   - Set package.json
 * - Write package files to packages/PACKAGE_DIRECTORY_NAME
 * - Rewrite monorepo files
 * - Regenerate dependency graph (execute package command)
 */

type CreatePackageOptions = {
  name: string;
  description: string;
  mitLicense: boolean;
};

export const newPackage: CommandModule<object, CreatePackageOptions> = {
  command: 'new',
  describe:
    'Create a new monorepo package. Handles a lot of the boilerplate for you.',
  builder: (argv: Argv<object>) => {
    argv
      .options({
        name: {
          alias: 'n',
          describe: 'The package name. Will be prefixed with "@metamask/".',
          type: 'string',
          requiresArg: true,
        },

        description: {
          alias: 'd',
          describe:
            'A short description of the package, as used in package.json.',
          type: 'string',
          requiresArg: true,
        },

        'mit-license': {
          description:
            'Whether the package is MIT-licensed. If not, an empty license file will be provided.',
          type: 'boolean',
          default: true,
          requiresArg: true,
        },
      })
      .check((args) => {
        for (const key in args) {
          if (
            typeof args[key] === 'string' &&
            (args[key] as string).trim() === ''
          ) {
            throw new Error(
              `The argument "${key}" must not be an empty string.`,
            );
          }
        }

        return true;
      });

    return argv as Argv<CreatePackageOptions>;
  },
  handler: async (args: Arguments<CreatePackageOptions>) =>
    createPackageHandler(args),
};

export const defaultPackage: CommandModule<object, CreatePackageOptions> = {
  command: 'default',
  describe: 'Create a new monorepo package with default values.',
  builder: (argv: Argv) => {
    argv.check((args) => {
      args.name = 'new-package';
      args.description = 'A new MetaMask package.';
      args['mit-license'] = true;

      return true;
    });
    return argv as Argv<CreatePackageOptions>;
  },
  handler: async (args: Arguments<CreatePackageOptions>) =>
    createPackageHandler(args),
};

/**
 * Creates a new monorepo package.
 *
 * @param args - The yargs arguments.
 */
export async function createPackageHandler(
  args: Arguments<CreatePackageOptions>,
) {
  console.log('createPackageHandler', args);
}
