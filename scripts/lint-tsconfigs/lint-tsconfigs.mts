import { hasProperty } from '@metamask/utils';
import fs from 'fs';
import path from 'path';

import { lintPackageTsconfigs } from './lint-package-tsconfigs.mjs';
import { lintRootTsconfigs } from './lint-root-tsconfigs.mjs';
import { readPackageManifest } from './utils.mjs';

// Run this script!
await main();

/**
 * Detects whether the script is being run from the repository root or from
 * within a package, then lints the appropriate tsconfig files.
 *
 * When run from the root, lints only the root tsconfig pair.
 * When run from a package, lints only that package's tsconfig pair.
 */
async function main(): Promise<void> {
  const cwd = process.cwd();
  const shouldFix = process.argv.includes('--fix');
  const manifest = await readPackageManifest(cwd);

  let didLintPass;
  if (hasProperty(manifest, 'workspaces')) {
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
    // eslint-disable-next-line require-atomic-updates
    process.exitCode = 1;
  }
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
