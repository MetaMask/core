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
  handler: async (args: Arguments<CreatePackageOptions>) =>
    await createPackageHandler(args),
};

const commands = [newPackage];
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
    nodeVersions: monorepoFileData.nodeVersions,
    currentYear: new Date().getFullYear().toString(),
  };

  await finalizeAndWriteData(packageData, monorepoFileData);
  console.log(`Created package "${packageData.name}"!`);
}
