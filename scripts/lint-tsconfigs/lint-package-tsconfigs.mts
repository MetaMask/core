import * as path from 'path';

import type {
  PackageManifest,
  TsconfigLintMetaReport,
  Workspace,
  Workspaces,
} from './utils.mjs';
import {
  ensureTsconfigsUpdated,
  filterWorkspacesWithTsconfig,
  getAllNonRootWorkspaces,
  lintTsconfigs,
  printReport,
  readPackageManifest,
  readTsconfig,
} from './utils.mjs';

/**
 * Lints a package's development, build, and lint TypeScript configs to ensure
 * they reference the expected workspace dependencies. Optionally fixes any
 * issues found.
 *
 * @param options - The options object.
 * @param options.packageRoot - The root directory of the package.
 * @param options.repoRoot - The root directory of the repository.
 * @param options.shouldFix - Whether to automatically fix issues.
 * @returns `true` if no issues were found, `false` otherwise.
 */
export async function lintPackageTsconfigs({
  packageRoot,
  repoRoot,
  shouldFix,
}: {
  packageRoot: string;
  repoRoot: string;
  shouldFix: boolean;
}): Promise<boolean> {
  const manifest = await readPackageManifest(packageRoot);
  const workspaces = await getAllNonRootWorkspaces(repoRoot);
  const expectedPackageNames = getExpectedWorkspaceDependencies({
    manifest,
    workspaces,
  });

  const devAndBuildReport = await lintPackageDevAndBuildOnlyTsconfigs({
    packageRoot,
    repoRoot,
    workspaces,
    expectedPackageNames,
    shouldFix,
  });
  const lintReport = await lintPackageLintOnlyTsconfigs({
    packageRoot,
    repoRoot,
    manifest,
    workspaces,
    expectedPackageNames,
    shouldFix,
  });

  return devAndBuildReport.didPass && lintReport.didPass;
}

/**
 * Lints a package's development- and build-only TypeScript configs to ensure
 * they reference the expected workspace dependencies. Optionally fixes any
 * issues found.
 *
 * @param options - The options object.
 * @param options.packageRoot - The root directory of the package.
 * @param options.repoRoot - The root directory of the repository.
 * @param options.workspaces - The workspaces in the repository.
 * @param options.expectedPackageNames - Workspace dependencies to reference.
 * @param options.shouldFix - Whether to automatically fix issues.
 * @returns The report resulting from the lint.
 */
export async function lintPackageDevAndBuildOnlyTsconfigs({
  packageRoot,
  repoRoot,
  workspaces,
  expectedPackageNames,
  shouldFix,
}: {
  packageRoot: string;
  repoRoot: string;
  workspaces: Workspaces;
  expectedPackageNames: Set<string>;
  shouldFix: boolean;
}): Promise<TsconfigLintMetaReport> {
  const devAndBuildTsconfigs = await Promise.all([
    readTsconfig(packageRoot, 'tsconfig.json'),
    readTsconfig(packageRoot, 'tsconfig.build.json'),
  ]);
  const expectedWorkspaces = getSortedWorkspaces({
    packageNames: expectedPackageNames,
    workspaces,
  });

  const report = shouldFix
    ? await ensureTsconfigsUpdated({
        workspaces: expectedWorkspaces,
        tsconfigs: devAndBuildTsconfigs,
        repoRoot,
        currentWorkspaceRoot: packageRoot,
      })
    : await lintTsconfigs({
        tsconfigs: devAndBuildTsconfigs,
        expectedPackageNames,
        workspaces,
        repoRoot,
        currentWorkspaceRoot: packageRoot,
      });

  printReport(report);

  return report;
}

/**
 * Lints a package's lint-only TypeScript config to ensure it references the
 * expected workspace dependencies. Optionally fixes any issues found.
 *
 * @param options - The options object.
 * @param options.packageRoot - The root directory of the package.
 * @param options.repoRoot - The root directory of the repository.
 * @param options.manifest - Contents of the package's `package.json` file.
 * @param options.workspaces - The workspaces in the repository.
 * @param options.expectedPackageNames - Workspace dependencies to reference.
 * @param options.shouldFix - Whether to automatically fix issues.
 * @returns The report resulting from the lint.
 */
export async function lintPackageLintOnlyTsconfigs({
  packageRoot,
  repoRoot,
  manifest,
  workspaces,
  expectedPackageNames,
  shouldFix,
}: {
  packageRoot: string;
  repoRoot: string;
  manifest: PackageManifest;
  workspaces: Workspaces;
  expectedPackageNames: Set<string>;
  shouldFix: boolean;
}): Promise<TsconfigLintMetaReport> {
  const expectedWorkspaces = getSortedWorkspaces({
    packageNames: expectedPackageNames,
    workspaces,
  });
  const lintWorkspaces = await filterWorkspacesWithTsconfig({
    workspaces: expectedWorkspaces,
    repoRoot,
    fileName: 'tsconfig.lint.json',
  });
  // This allows us to increase linting for the whole repo incrementally.
  const packageLintWorkspaces = await filterWorkspacesWithTsconfig({
    workspaces: [
      {
        name: manifest.name,
        location: path.relative(repoRoot, packageRoot),
      },
    ],
    repoRoot,
    fileName: 'tsconfig.lint.json',
  });
  const lintTsconfigsToCheck =
    packageLintWorkspaces.length === 0
      ? []
      : [await readTsconfig(packageRoot, 'tsconfig.lint.json')];

  const report = shouldFix
    ? await ensureTsconfigsUpdated({
        workspaces: lintWorkspaces,
        tsconfigs: lintTsconfigsToCheck,
        repoRoot,
        currentWorkspaceRoot: packageRoot,
      })
    : await lintTsconfigs({
        tsconfigs: lintTsconfigsToCheck,
        expectedPackageNames: new Set(
          lintWorkspaces.map((workspace) => workspace.name),
        ),
        workspaces,
        repoRoot,
        currentWorkspaceRoot: packageRoot,
      });

  printReport(report);

  return report;
}

/**
 * Determines which workspace packages should be referenced in the tsconfig
 * based on the package's dependencies and devDependencies.
 *
 * @param options - The options object.
 * @param options.manifest - Contents of the package's `package.json` file.
 * @param options.workspaces - The workspaces to iterate through.
 * @returns A set of package names that should be referenced.
 */
function getExpectedWorkspaceDependencies({
  manifest,
  workspaces,
}: {
  manifest: PackageManifest;
  workspaces: Workspaces;
}): Set<string> {
  const allDependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };

  return new Set(
    Object.keys(allDependencies).filter((dependencyName) =>
      workspaces.names.has(dependencyName),
    ),
  );
}

/**
 * Gets workspace metadata for the given package names in alphabetical order.
 *
 * @param options - The options object.
 * @param options.packageNames - Workspace package names to resolve.
 * @param options.workspaces - The workspaces in the repository.
 * @returns The corresponding workspaces in alphabetical order.
 */
function getSortedWorkspaces({
  packageNames,
  workspaces,
}: {
  packageNames: Set<string>;
  workspaces: Workspaces;
}): Workspace[] {
  return [...packageNames]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const workspace = workspaces.byName.get(name);
      if (!workspace) {
        throw new Error(`Expected workspace not found for package: ${name}`);
      }
      return workspace;
    });
}
