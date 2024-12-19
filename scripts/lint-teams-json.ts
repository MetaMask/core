import { readJsonFile } from '@metamask/utils/node';
import { getPluginConfiguration } from '@yarnpkg/cli';
import { Configuration, Project, structUtils } from '@yarnpkg/core';
import { ppath } from '@yarnpkg/fslib';
import path from 'path';

main().catch(console.error);

/**
 * The entrypoint to this script.
 *
 * Cross-checks the packages listed in `teams.json` against the public packages
 * in the monorepo. If there are any packages missing from `teams.json`, prints
 * an error and exits with a non-zero code.
 */
async function main() {
  const releaseableWorkspaces = await getPublicWorkspaces();
  const releaseablePackageNames = releaseableWorkspaces.map((workspace) => {
    const packageName = workspace.manifest.name;
    if (packageName === null) {
      throw new Error(
        `${structUtils.stringifyIdent(
          workspace.anchoredDescriptor,
        )} has no name in its manifest`,
      );
    }
    // The package names in teams.json omit the leading "@", so we do that here
    // too in order to be consistent
    return structUtils.stringifyIdent(packageName).slice(1);
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
 * Uses the Yarn API to gather the Yarn workspaces inside of this project (the
 * packages that are matched by the `workspaces` field inside of
 * `package.json`).
 *
 * @returns The list of workspaces.
 */
async function getPublicWorkspaces() {
  const cwd = ppath.resolve('..', ppath.cwd());
  const configuration = await Configuration.find(cwd, getPluginConfiguration());
  const { project } = await Project.find(configuration, cwd);

  return project.workspaces.filter((workspace) => {
    return !workspace.manifest.private;
  });
}
