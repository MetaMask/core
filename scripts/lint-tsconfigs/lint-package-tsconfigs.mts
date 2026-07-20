import type {
  PackageManifest,
  TsconfigLintMetaReport,
  Workspaces,
} from './utils.mjs';
import {
  ensureTsconfigsUpdated,
  getAllNonRootWorkspaces,
  lintTsconfigs,
  printReport,
  readPackageManifest,
  readTsconfig,
} from './utils.mjs';

/**
 * Lints a package's tsconfig.json and tsconfig.build.json files to ensure they
 * reference all workspace dependencies. Optionally fixes any issues found.
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
  const tsconfigs = await Promise.all([
    readTsconfig(packageRoot, 'tsconfig.json'),
    readTsconfig(packageRoot, 'tsconfig.build.json'),
  ]);
  const expectedPackageNames = getExpectedWorkspaceDependencies({
    manifest,
    workspaces,
  });
  const sortedExpectedWorkspaces = [...expectedPackageNames]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const workspace = workspaces.byName.get(name);
      if (!workspace) {
        throw new Error(`Expected workspace not found for package: ${name}`);
      }
      return workspace;
    });

  let report: TsconfigLintMetaReport;
  if (shouldFix) {
    report = await ensureTsconfigsUpdated({
      workspaces: sortedExpectedWorkspaces,
      tsconfigs,
      repoRoot,
      currentWorkspaceRoot: packageRoot,
    });
  } else {
    report = await lintTsconfigs({
      tsconfigs,
      expectedPackageNames,
      workspaces,
      repoRoot,
      currentWorkspaceRoot: packageRoot,
    });
  }

  printReport(report);

  return report.didPass;
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
