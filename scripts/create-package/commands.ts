import type { Argv, CommandModule, Arguments } from 'yargs';

import type { PackageData } from './utils';
import { finalizeAndWriteData, readMonorepoFiles } from './utils';

export type CreatePackageOptions = {
  name: string;
  description: string;
};

/**
 * The yargs command for creating a new monorepo package.
 */
const newPackage: CommandModule<object, CreatePackageOptions> = {
  command: 'new',
  describe: 'Create a new monorepo package.',
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
      })
      .example(
        '$0 new --name fabulous-package --description "A fabulous package."',
        'Create a new package with the given name and description.',
      )
      .check((args) => {
        if (!(args.name as string).startsWith('@metamask/')) {
          args.name = `@metamask/${args.name as string}`;
        }

        return true;
      });

    return argv as Argv<CreatePackageOptions>;
  },
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  handler: async (args: Arguments<CreatePackageOptions>) =>
    createPackageHandler(args),
};

/**
 * The yargs command for creating a monorepo package with some default values.
 */
const defaultPackage: CommandModule<object, CreatePackageOptions> = {
  command: 'default',
  describe: 'Create a new monorepo package, with default values.',
  builder: (argv: Argv) => {
    argv
      .example('$0 default', 'Create a new package with default values.')
      .check((args) => {
        args.name = '@metamask/new-package';
        args.description = 'A new MetaMask package.';

        return true;
      });
    return argv as Argv<CreatePackageOptions>;
  },
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  handler: async (args: Arguments<CreatePackageOptions>) =>
    createPackageHandler(args),
};

const commands = [newPackage, defaultPackage];
export default commands;

/**
 * Creates a new monorepo package.
 *
 * @param args - The yargs arguments.
 */
export async function createPackageHandler(
  args: Arguments<CreatePackageOptions>,
): Promise<void> {
  console.log(`Attempting to create package "${args.name}"...`);

  const monorepoFileData = await readMonorepoFiles();
  const packageData: PackageData = {
    name: args.name,
    description: args.description,
    directoryName: args.name.slice('@metamask/'.length),
    nodeVersion: monorepoFileData.nodeVersion,
    currentYear: new Date().getFullYear().toString(),
  };

  await finalizeAndWriteData(packageData, monorepoFileData);
  console.log(`Created package "${packageData.name}"!`);
}
