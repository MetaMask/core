#!yarn ts-node

import execa from 'execa';
import semver from 'semver';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

type Workspace = {
  location: string;
  name: string;
};

enum Format {
  PerCommit = 'per-commit',
  Together = 'together',
}

class KnownError extends Error {
  // do nothing
}

main().catch((error) => {
  if (error instanceof KnownError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

/**
 * Show changes for a workspace package since its last release.
 *
 * Here's a couple of examples of how you can call this script:
 *
 * ```
 * scripts/changes-since-last-release.ts --format per-commit @metamask/transaction-controller | less -r
 * scripts/changes-since-last-release.ts --format together @metamask/transaction-controller | less -r
 * ```
 */
async function main() {
  const { packageName, format } = await yargs(hideBin(process.argv))
    .scriptName('scripts/changes-since-last-release.ts')
    .command(
      '$0 <package-name>',
      'Show changes for a workspace package since its previous release.',
      (y) => {
        y.positional('package-name', {
          describe: 'The name of the package to show changes for.',
        });
      },
    )
    .option('format', {
      alias: 'f',
      describe: 'How to show the changes: divided by commit or all together',
      choices: Object.values(Format),
      default: Format.PerCommit,
    })
    .string('_')
    .help()
    .strict()
    .parse();

  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.name === packageName);
  if (!workspace) {
    throw new KnownError(`Could not map ${packageName} to a workspace`);
  }

  const tags = await getTags();
  const tagsForWorkspace = tags.filter((line) =>
    line.startsWith(`${workspace.name}@`),
  );
  if (tagsForWorkspace.length === 0) {
    throw new KnownError(`No version tags found for ${workspace.name}.`);
  }
  const versions = tagsForWorkspace.map((tag) => {
    const versionString = tag.split('@', 3)[2];
    const parsedVersionString = semver.parse(versionString);
    if (!parsedVersionString) {
      throw new Error(`Invalid version tag ${tag}`);
    }
    return parsedVersionString;
  });
  const sortedVersions = versions.sort((a, b) => a.compare(b));
  const latestVersion = sortedVersions[sortedVersions.length - 1];

  console.log(
    `Showing changes for \u001B[34m${
      workspace.name
    }\u001B[0m since \u001B[34m${latestVersion.toString()}\u001B[0m.\n`,
  );
  await showDiff(workspace, latestVersion, { format });
}

/**
 * Retrieve the set of Yarn workspaces in this project.
 *
 * @returns The set of workspaces.
 */
async function getWorkspaces(): Promise<Workspace[]> {
  const { stdout } = await execa('yarn', ['workspaces', 'list', '--json']);
  const workspaces = stdout.split('\n').map((line) => JSON.parse(line));
  return workspaces.filter((workspace) => workspace.location !== '.');
}

/**
 * Retrieve the set of Git tags in this project.
 *
 * @returns The set of tags.
 */
async function getTags(): Promise<string[]> {
  const { stdout } = await execa('git', ['tag']);
  return stdout.split('\n');
}

/**
 * Show the set of changes in the latest release of the given package.
 *
 * @param workspace - The workspace that represents the package.
 * @param latestVersion - The version (as a `semver` object).
 * @param options - An options bag.
 * @param options.format - How to show the changes: divided by commit or all
 * together.
 */
async function showDiff(
  workspace: Workspace,
  latestVersion: semver.SemVer,
  { format = Format.PerCommit } = {},
): Promise<void> {
  const gitOptions = ['--no-pager'];
  const gitCommandOptions = ['--color'];
  const args =
    format === Format.PerCommit
      ? [
          ...gitOptions,
          'log',
          ...gitCommandOptions,
          '-p',
          `${workspace.name}@${latestVersion.toString()}..HEAD`,
          '--',
          workspace.location,
        ]
      : [
          ...gitOptions,
          'diff',
          ...gitCommandOptions,
          `${workspace.name}@${latestVersion.toString()}..HEAD`,
          workspace.location,
        ];
  await execa('git', args, {
    stdio: 'inherit',
  });
}
