import { fileExists } from '@metamask/utils/node';
import execa from 'execa';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT_WORKSPACE = new URL('..', import.meta.url).pathname;

type Workspace = {
  location: string;
  name: string;
};

/**
 * Get all TypeScript workspaces in the monorepo. This checks for packages
 * containing a "tsconfig.build.json" file.
 *
 * @returns The workspaces in the monorepo.
 */
async function getWorkspaces(): Promise<Workspace[]> {
  const { stdout } = await execa('yarn', ['workspaces', 'list', '--json'], {
    cwd: ROOT_WORKSPACE,
    encoding: 'utf8',
  });

  const entries: Workspace[] = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter(({ location }: Workspace) => location !== '.');

  return (
    await Promise.all(
      entries.map(async (workspace) => {
        const hasTsConfig = await fileExists(
          join(ROOT_WORKSPACE, workspace.location, 'tsconfig.build.json'),
        );

        return hasTsConfig ? workspace : null;
      }),
    )
  ).filter((workspace): workspace is Workspace => workspace !== null);
}

/**
 * Get a map of package name -> names of packages that depend on it.
 *
 * @param workspaces - The workspaces in the monorepo.
 * @returns A map of package name -> names of packages that depend on it.
 */
async function getWorkspaceDependencies(
  workspaces: Workspace[],
): Promise<Record<string, Set<string>>> {
  const dependants: Record<string, Set<string>> = Object.fromEntries(
    workspaces.map(({ name }) => [name, new Set<string>()]),
  );

  for (const { name, location } of workspaces) {
    const pkg = JSON.parse(
      await readFile(join(ROOT_WORKSPACE, location, 'package.json'), {
        encoding: 'utf-8',
      }),
    );

    for (const dependency of Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    })) {
      dependants[dependency]?.add(name);
    }
  }

  return dependants;
}

/**
 * Get the list of files changed since the given merge base.
 *
 * @param mergeBase - The merge base SHA to diff against.
 * @returns A list of changed file paths.
 */
async function getChangedFiles(mergeBase: string): Promise<string[]> {
  const { stdout } = await execa(
    'git',
    ['diff', '--name-only', `${mergeBase}...HEAD`],
    {
      cwd: ROOT_WORKSPACE,
      encoding: 'utf8',
    },
  );

  return stdout.trim().split('\n').filter(Boolean);
}

/**
 * Generate a filtered tsconfig.build.json for partial CI builds.
 *
 * Given a merge base SHA, outputs a tsconfig that references only the
 * packages that changed since that commit plus their transitive dependants.
 * Pipe the output to a temp file and pass it to `ts-bridge --project`.
 *
 * Usage: `tsx scripts/generate-partial-build-tsconfig.ts <merge-base-sha>`.
 */
async function main() {
  const mergeBase = process.argv[2];
  if (!mergeBase) {
    console.error('Usage: generate-partial-build-tsconfig.ts <merge-base-sha>');

    process.exitCode = 1;
    return;
  }

  const workspaces = await getWorkspaces();
  const changedFiles = await getChangedFiles(mergeBase);
  const dependants = await getWorkspaceDependencies(workspaces);

  const packagesToBuild = new Set(
    changedFiles.flatMap((file) => {
      const workspace = workspaces.find(({ location }) =>
        file.startsWith(`${location}/`),
      );

      return workspace ? [workspace.name] : [];
    }),
  );

  for (const packageToBuild of packagesToBuild) {
    for (const dependant of dependants[packageToBuild] ?? []) {
      packagesToBuild.add(dependant);
    }
  }

  const references = workspaces
    .filter(({ name }) => packagesToBuild.has(name))
    .map(({ location }) => ({ path: `./${location}/tsconfig.build.json` }));

  console.log(JSON.stringify({ files: [], include: [], references }, null, 2));
}

await main();
