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

type DependencyGraph = {
  dependants: Record<string, Set<string>>;
  dependencies: Record<string, Set<string>>;
};

/**
 * Get dependency and dependant maps for all workspaces.
 *
 * @param workspaces - The workspaces in the monorepo.
 * @returns Maps of package name -> dependants and package name -> dependencies.
 */
async function getWorkspaceDependencies(
  workspaces: Workspace[],
): Promise<DependencyGraph> {
  const dependants: Record<string, Set<string>> = Object.fromEntries(
    workspaces.map(({ name }) => [name, new Set<string>()]),
  );
  const dependencies: Record<string, Set<string>> = Object.fromEntries(
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
      if (dependants[dependency] !== undefined) {
        dependants[dependency].add(name);
        dependencies[name].add(dependency);
      }
    }
  }

  return { dependants, dependencies };
}

/**
 * Get the list of files changed between the merge base and the PR head.
 *
 * @param mergeBase - The merge base SHA.
 * @param headRef - The PR branch tip SHA (or "HEAD" as fallback).
 * @returns A list of changed file paths.
 */
async function getChangedFiles(
  mergeBase: string,
  headRef: string,
): Promise<string[]> {
  const { stdout } = await execa(
    'git',
    ['diff', '--name-only', `${mergeBase}...${headRef}`],
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
 * Usage: `tsx scripts/generate-partial-build-tsconfig.ts <merge-base-sha> [head-sha]`.
 */
async function main() {
  const mergeBase = process.argv[2];
  if (!mergeBase) {
    console.error(
      'Usage: generate-partial-build-tsconfig.ts <merge-base-sha> [head-sha]',
    );

    process.exitCode = 1;
    return;
  }

  const headRef = process.argv[3] ?? 'HEAD';

  const workspaces = await getWorkspaces();
  const changedFiles = await getChangedFiles(mergeBase, headRef);
  const { dependants, dependencies } =
    await getWorkspaceDependencies(workspaces);

  const packagesToBuild = new Set(
    changedFiles.flatMap((file) => {
      const workspace = workspaces.find(({ location }) =>
        file.startsWith(`${location}/`),
      );

      return workspace ? [workspace.name] : [];
    }),
  );

  // Expand to transitive dependants (packages that depend on what changed).
  for (const packageToBuild of packagesToBuild) {
    for (const dependant of dependants[packageToBuild] ?? []) {
      packagesToBuild.add(dependant);
    }
  }

  // Expand to transitive dependencies (dist files must exist to build
  // dependants).
  for (const packageToBuild of packagesToBuild) {
    for (const dependency of dependencies[packageToBuild] ?? []) {
      packagesToBuild.add(dependency);
    }
  }

  const references = workspaces
    .filter(({ name }) => packagesToBuild.has(name))
    .map(({ location }) => ({ path: `./${location}/tsconfig.build.json` }));

  if (references.length === 0) {
    return;
  }

  console.log(JSON.stringify({ files: [], include: [], references }, null, 2));
}

await main();
