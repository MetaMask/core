import type { Argv, CommandModule, Arguments } from 'yargs';

import type { PackageData } from './utils';
import { finalizeAndWriteData, readMonorepoFiles } from './utils';

type CreatePackageOptions = {
  name: string;
  description: string;
  mitLicense: boolean;
};

/**
 * The yargs command module for creating a new monorepo package.
 */
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

        if (!args.name?.startsWith('@metamask/')) {
          args.name = `@metamask/${args.name}`;
        }

        return true;
      });

    return argv as Argv<CreatePackageOptions>;
  },
  handler: async (args: Arguments<CreatePackageOptions>) =>
    createPackageHandler(args),
};

/**
 * The yargs command module for creating a monorepo package with some default values.
 */
export const defaultPackage: CommandModule<object, CreatePackageOptions> = {
  command: 'default',
  describe: 'Create a new monorepo package with default values.',
  builder: (argv: Argv) => {
    argv.check((args) => {
      args.name = '@metamask/new-package';
      args.description = 'A new MetaMask package.';
      args.mitLicense = true;

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
  const monorepoFileData = await readMonorepoFiles();
  const packageData: PackageData = {
    name: args.name,
    description: args.description,
    mitLicense: args.mitLicense,
    directoryName: args.name.slice('@metamask/'.length),
    nodeVersion: monorepoFileData.nodeVersion,
    currentYear: new Date().getFullYear().toString(),
  };

  await finalizeAndWriteData(packageData, monorepoFileData);
}
