import { fileExists } from '@metamask/utils/node';
import { getPluginConfiguration } from '@yarnpkg/cli';
import {
  Configuration,
  LocatorHash,
  Project,
  structUtils,
  ThrowReport,
} from '@yarnpkg/core';
import { ppath } from '@yarnpkg/fslib';
import { parseSyml } from '@yarnpkg/parsers';
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
  'teams.json',

  // The lockfile has special logic for determining whether a package
  // build/test/lint run is required, so it should not trigger a full run on its
  // own.
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
  const { stdout } = await execa(
    'yarn',
    ['workspaces', 'list', '--no-private', '--json'],
    {
      cwd: ROOT_WORKSPACE,
      encoding: 'utf8',
    },
  );

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

  const packages = await Promise.all(
    workspaces.map(({ location }) =>
      readFile(join(ROOT_WORKSPACE, location, 'package.json'), {
        encoding: 'utf-8',
      }).then(JSON.parse),
    ),
  );

  for (const [index, { name }] of workspaces.entries()) {
    const pkg = packages[index];
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
 * Get the set of package names whose entries changed in yarn.lock between
 * `mergeBase` and the current working tree.
 *
 * @param mergeBase - The merge base SHA to compare the lockfile against.
 * @returns The set of changed package names.
 */
async function getChangedLockfilePackages(
  mergeBase: string,
): Promise<Set<string>> {
  const [{ stdout: baseLockContent }, currentLockContent] = await Promise.all([
    execa('git', ['show', `${mergeBase}:yarn.lock`], {
      cwd: ROOT_WORKSPACE,
      encoding: 'utf8',
    }),
    readFile(join(ROOT_WORKSPACE, 'yarn.lock'), 'utf-8'),
  ]);

  const baseLock = parseSyml(baseLockContent);
  const currentLock = parseSyml(currentLockContent);

  const changedPackageNames = new Set<string>();
  const allKeys = new Set([
    ...Object.keys(baseLock),
    ...Object.keys(currentLock),
  ]);

  for (const key of allKeys) {
    // Ignore metadata.
    if (key.startsWith('__')) {
      continue;
    }

    if (baseLock[key]?.checksum === currentLock[key]?.checksum) {
      continue;
    }

    // A key may be a comma-separated list of descriptors resolving to the same
    // version (e.g. "lodash@npm:^4.0.0, lodash@npm:^4.17.0").
    const descriptorKeys = key
      .split(',')
      .map((descriptorKey) => descriptorKey.trim());

    for (const descriptorKey of descriptorKeys) {
      const descriptor = structUtils.parseDescriptor(descriptorKey);
      changedPackageNames.add(structUtils.stringifyIdent(descriptor));
    }
  }

  return changedPackageNames;
}

/**
 * Build a map from each workspace name to the full set of its transitive
 * dependencies, by walking the resolved lockfile graph via `@yarnpkg/core`.
 *
 * @returns A map from workspace name to the set of all transitive dependency
 * names.
 */
async function buildWorkspaceTransitiveDependencies(): Promise<
  Map<string, Set<string>>
> {
  const workingDirectory = ppath.cwd();
  const configuration = await Configuration.find(
    workingDirectory,
    getPluginConfiguration(),
    {
      // `@yarnpkg/core` is outdated and with `strict: true` fails with
      // "Unrecognized or legacy configuration settings found:
      // approvedGitRepositories".
      strict: false,
    },
  );

  const { project } = await Project.find(configuration, workingDirectory);
  await project.resolveEverything({
    lockfileOnly: true,
    report: new ThrowReport(),
  });

  const graph = new Map<string, Set<string>>();

  for (const workspace of project.workspaces) {
    const name = workspace.manifest.name
      ? structUtils.stringifyIdent(workspace.manifest.name)
      : 'root';

    const allTransitiveDependencies = new Set<string>();
    const visitedLocatorHashes = new Set<LocatorHash>();

    function walkDependencies(locatorHash: LocatorHash): void {
      if (visitedLocatorHashes.has(locatorHash)) {
        return;
      }

      visitedLocatorHashes.add(locatorHash);

      const packageConfig = project.storedPackages.get(locatorHash);
      if (!packageConfig) {
        return;
      }

      for (const descriptor of packageConfig.dependencies.values()) {
        const depName = structUtils.stringifyIdent(descriptor);
        allTransitiveDependencies.add(depName);

        const resolvedLocatorHash = project.storedResolutions.get(
          descriptor.descriptorHash,
        );

        if (resolvedLocatorHash) {
          walkDependencies(resolvedLocatorHash);
        }
      }
    }

    walkDependencies(workspace.anchoredLocator.locatorHash);
    graph.set(name, allTransitiveDependencies);
  }

  return graph;
}

/**
 * Given a merge base SHA, determine which workspaces are affected by changes
 * to `yarn.lock` between that commit and the current working tree.
 *
 * A workspace is considered affected if any package that changed in the
 * lockfile appears in its transitive dependency closure.
 *
 * @param mergeBase - The merge base SHA to compare the lockfile against.
 * @param workspaces - The workspace set to check against.
 * @returns The set of workspace names whose transitive dependencies include
 * any package that changed in the lockfile.
 */
async function getLockfileAffectedWorkspaces(
  mergeBase: string,
  workspaces: Workspace[],
): Promise<Set<string>> {
  const [changedPackages, workspaceGraph] = await Promise.all([
    getChangedLockfilePackages(mergeBase),
    buildWorkspaceTransitiveDependencies(),
  ]);

  const result = new Set<string>();

  for (const { name } of workspaces) {
    const transitiveDeps = workspaceGraph.get(name);
    if (!transitiveDeps) {
      continue;
    }

    for (const pkg of changedPackages) {
      if (transitiveDeps.has(pkg)) {
        result.add(name);
        break;
      }
    }
  }

  return result;
}

/**
 * Check whether any changed file lives outside all package directories and
 * is not in the ignored root files list. When true, a full
 * rebuild/test/lint run is required.
 *
 * @param workspaces - The workspace set to check against.
 * @param changedFiles - The list of changed file paths.
 * @returns Whether any non-ignored root file changed.
 */
export function checkRootChange(
  workspaces: Workspace[],
  changedFiles: string[],
): boolean {
  return changedFiles.some(
    (file) =>
      !IGNORED_ROOT_FILES.has(file) &&
      !workspaces.some(({ location }) => file.startsWith(`${location}/`)),
  );
}

/**
 * Compute the set of workspace names that need to be checked given a merge
 * base, by finding changed packages and expanding to transitive dependants.
 *
 * When `includeDependencies` is true, also expands to transitive dependencies.
 * This is needed for TypeScript project reference builds, where every
 * referenced project's dist output must already exist on disk.
 *
 * When `yarn.lock` appears in `changedFiles`, the lockfile is diffed against
 * `mergeBase` to identify which workspaces have an affected transitive
 * dependency, and those are seeded into the result before dependant expansion.
 *
 * @param options - Options.
 * @param options.workspaces - The workspace set to compute against.
 * @param options.changedFiles - List of changed files relative to the repo root.
 * @param options.includeDependencies - Whether to also expand to transitive
 * dependencies.
 * @param options.mergeBase - The merge base SHA, used to diff `yarn.lock` when
 * it changed.
 * @returns The set of workspace names to check.
 */
export async function computeChangedWorkspaces({
  workspaces,
  changedFiles,
  includeDependencies,
  mergeBase,
}: {
  workspaces: Workspace[];
  changedFiles: string[];
  includeDependencies: boolean;
  mergeBase: string;
}): Promise<Set<string>> {
  const { dependants, dependencies } =
    await getWorkspaceDependencies(workspaces);

  // If any changed file lives outside all package directories (e.g. root
  // configs, workflow files, scripts), rebuild and test everything.
  if (checkRootChange(workspaces, changedFiles)) {
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

  // When the lockfile changed, diff it to find which workspaces have an
  // affected transitive dependency, and seed them into the result before
  // the dependant expansion below.
  if (changedFiles.includes('yarn.lock')) {
    for (const pkg of await getLockfileAffectedWorkspaces(
      mergeBase,
      workspaces,
    )) {
      result.add(pkg);
    }
  }

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
