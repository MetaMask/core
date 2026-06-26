import { readJsonFile } from '@metamask/utils/node';
import execa from 'execa';
import path from 'path';

type Workspace = {
  location: string;
  name: string;
};

// Run the script immediately.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 *
 * Cross-checks the packages listed in `teams.json` against the public packages
 * in the monorepo. If there are any packages missing from `teams.json`, prints
 * an error and exits with a non-zero code.
 */
async function main(): Promise<void> {
  const releaseableWorkspaces = await getPublicWorkspaces();
  const releaseablePackageNames = releaseableWorkspaces.map((workspace) => {
    // The package names in teams.json omit the leading "@", so we do that here
    // too in order to be consistent
    return workspace.name.slice(1);
  });

  const teams = await readJsonFile<Record<string, string>>(
    path.resolve(__dirname, '../teams.json'),
  );
  const assignedPackageNames = Object.keys(teams);

  const missingPackageNames = releaseablePackageNames.filter(
    (releaseablePackageName) => {
      return !assignedPackageNames.includes(releaseablePackageName);
    },
  );

  if (missingPackageNames.length > 0) {
    console.error(
      'ERROR: teams.json is invalid. Please add the following packages:',
    );
    for (const missingPackageName of missingPackageNames) {
      console.error(`- ${missingPackageName}`);
    }
    process.exitCode = 1;
  }
}

/**
 * Uses the `yarn` executable to gather the Yarn workspaces inside of this
 * project (the packages that are matched by the `workspaces` field inside of
 * `package.json`).
 *
 * @returns The list of workspaces.
 */
async function getPublicWorkspaces(): Promise<Workspace[]> {
  const { stdout } = await execa('yarn', [
    'workspaces',
    'list',
    '--json',
    '--no-private',
  ]);

  return stdout.split('\n').map((line) => JSON.parse(line));
}
