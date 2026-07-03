import { fileExists } from '@metamask/utils/node';
import execa from 'execa';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ROOT_WORKSPACE = new URL('../..', import.meta.url).pathname;

// Files that can change without requiring a full rebuild/test run.
const IGNORED_ROOT_FILES = new Set([
  '.gitignore',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'eslint-suppressions.json',
  'teams.json',
  'yarn.lock',
]);

export type Workspace = {
  location: string;
  name: string;
};

export type DependencyGraph = {
  dependants: Record<string, Set<string>>;
  dependencies: Record<string, Set<string>>;
};

/**
 * Get all non-root workspaces in the monorepo.
 *
 * @returns All workspaces.
 */
export async function getAllWorkspaces(): Promise<Workspace[]> {
  const { stdout } = await execa('yarn', ['workspaces', 'list', '--json'], {
    cwd: ROOT_WORKSPACE,
    encoding: 'utf8',
  });

  return stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter(({ location }: Workspace) => location !== '.');
}

/**
 * Get all TypeScript workspaces in the monorepo. This filters to packages
 * containing a "tsconfig.build.json" file.
 *
 * @returns All TypeScript workspaces.
 */
export async function getTypeScriptWorkspaces(): Promise<Workspace[]> {
  const workspaces = await getAllWorkspaces();

  return (
    await Promise.all(
      workspaces.map(async (workspace) => {
        const hasTsConfig = await fileExists(
          join(ROOT_WORKSPACE, workspace.location, 'tsconfig.build.json'),
        );
        return hasTsConfig ? workspace : null;
      }),
    )
  ).filter((workspace): workspace is Workspace => workspace !== null);
}

/**
 * Get dependency and dependant maps for all workspaces.
 *
 * @param workspaces - The workspaces to build the graph for.
 * @returns Maps of package name to dependants and package name to dependencies.
 */
export async function getWorkspaceDependencies(
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
export async function getChangedFiles(
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
 * Compute the set of workspace names that need to be checked given a merge
 * base, by finding changed packages and expanding to transitive dependants.
 *
 * When `includeDependencies` is true, also expands to transitive dependencies.
 * This is needed for TypeScript project reference builds, where every
 * referenced project's dist output must already exist on disk.
 *
 * @param workspaces - The workspace set to compute against.
 * @param mergeBase - The merge base SHA.
 * @param headRef - The PR branch tip SHA (or "HEAD" as fallback).
 * @param includeDependencies - Whether to also expand to transitive dependencies.
 * @returns The set of workspace names to check.
 */
export async function computeChangedWorkspaces(
  workspaces: Workspace[],
  mergeBase: string,
  headRef: string,
  includeDependencies: boolean,
): Promise<Set<string>> {
  const changedFiles = await getChangedFiles(mergeBase, headRef);
  const { dependants, dependencies } =
    await getWorkspaceDependencies(workspaces);

  // If any changed file lives outside all package directories (e.g. root
  // configs, workflow files, scripts), rebuild and test everything.
  const hasRootChange = changedFiles.some(
    (file) =>
      !IGNORED_ROOT_FILES.has(file) &&
      !workspaces.some(({ location }) => file.startsWith(`${location}/`)),
  );

  if (hasRootChange) {
    return new Set(workspaces.map(({ name }) => name));
  }

  const result = new Set(
    changedFiles.flatMap((file) => {
      const workspace = workspaces.find(({ location }) =>
        file.startsWith(`${location}/`),
      );
      return workspace ? [workspace.name] : [];
    }),
  );

  // Expand to transitive dependants (packages that depend on what changed).
  for (const pkg of result) {
    for (const dependant of dependants[pkg] ?? []) {
      result.add(dependant);
    }
  }

  if (includeDependencies) {
    // Expand to transitive dependencies (dist files must exist to build dependants).
    for (const pkg of result) {
      for (const dependency of dependencies[pkg] ?? []) {
        result.add(dependency);
      }
    }
  }

  return result;
}
