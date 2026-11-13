import { hasProperty } from '@metamask/type-utils';
import { getPluginConfiguration } from '@yarnpkg/cli';
import { Configuration, Project } from '@yarnpkg/core';
import { npath, ppath } from '@yarnpkg/fslib';
import { Semaphore } from 'async-mutex';
import fs from 'fs';
import { availableParallelism } from 'os';
import path from 'path';

import { lintPackageTsconfigs } from './lint-package-tsconfigs.ts';
import { lintRootTsconfigs } from './lint-root-tsconfigs.ts';
import { readPackageManifest } from './utils.ts';

// Run this script!
await main();

/**
 * Detects whether the script is being run from the repository root or from
 * within a package, then lints the appropriate tsconfig files.
 *
 * When run from the root, lints only the root TypeScript configs.
 * When run from a package, lints only that package's TypeScript configs.
 * When run with `--all`, lints the root TypeScript configs and the TypeScript
 * configs of every workspace package.
 */
async function main(): Promise<void> {
  const cwd = process.cwd();
  const shouldFix = process.argv.includes('--fix');
  const manifest = await readPackageManifest(cwd);

  let didLintPass;
  if (process.argv.includes('--all')) {
    didLintPass = await lintAllTsconfigs({ cwd, shouldFix });
  } else if (hasProperty(manifest, 'workspaces')) {
    // We are in the root.
    didLintPass = await lintRootTsconfigs({ repoRoot: cwd, shouldFix });
  } else {
    // We are in a package.
    const repoRoot = await getRepoRoot(cwd);
    didLintPass = await lintPackageTsconfigs({
      packageRoot: cwd,
      repoRoot,
      shouldFix,
    });
  }

  if (!didLintPass) {
    // oxlint-disable-next-line require-atomic-updates
    process.exitCode = 1;
  }
}

/**
 * Lints the root TypeScript configs and the TypeScript configs of every
 * workspace package.
 *
 * @param options - The options object.
 * @param options.cwd - A directory within the Yarn project.
 * @param options.shouldFix - Whether to automatically fix issues.
 * @returns `true` if no issues were found in any workspace, `false` otherwise.
 */
async function lintAllTsconfigs({
  cwd,
  shouldFix,
}: {
  cwd: string;
  shouldFix: boolean;
}): Promise<boolean> {
  const { repoRoot, packageRoots } = await getProjectRoots(cwd);

  const didRootPass = await lintRootTsconfigs({ repoRoot, shouldFix });

  const semaphore = new Semaphore(availableParallelism());
  const results = await Promise.all(
    packageRoots.map(async (packageRoot) =>
      semaphore.runExclusive(async () =>
        lintPackageTsconfigs({ packageRoot, repoRoot, shouldFix }),
      ),
    ),
  );

  return didRootPass && results.every(Boolean);
}

/**
 * Read the Yarn project to find the repository root and the root directory of
 * each non-root workspace.
 *
 * @param cwd - A directory within the Yarn project.
 * @returns The repository root and the (sorted) workspace package roots.
 */
async function getProjectRoots(
  cwd: string,
): Promise<{ repoRoot: string; packageRoots: string[] }> {
  const configuration = await Configuration.find(
    npath.toPortablePath(cwd),
    getPluginConfiguration(),
    // `@yarnpkg/core` is outdated and with `strict: true` fails on newer
    // configuration settings.
    { strict: false },
  );

  const { project } = await Project.find(
    configuration,
    npath.toPortablePath(cwd),
  );

  const packageRoots = project.workspaces
    .filter((workspace) => workspace.cwd !== project.cwd)
    .map((workspace) => npath.fromPortablePath(ppath.resolve(workspace.cwd)))
    .sort();

  return { repoRoot: npath.fromPortablePath(project.cwd), packageRoots };
}

/**
 * Resolves the repository root by walking up from a package directory.
 *
 * @param packageRoot - The root directory of the package.
 * @returns The nearest ancestor directory containing a package.json file.
 */
async function getRepoRoot(packageRoot: string): Promise<string> {
  let currentDirectory = path.dirname(packageRoot);
  // The dirname of / is /.
  while (currentDirectory !== path.dirname(currentDirectory)) {
    const packageJsonPath = path.join(currentDirectory, 'package.json');
    try {
      await fs.promises.access(packageJsonPath);
      return currentDirectory;
    } catch {
      // Continue traversing up.
    }
    currentDirectory = path.dirname(currentDirectory);
  }
  return packageRoot;
}
