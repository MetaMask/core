import type { TsconfigLintMetaReport, Workspaces } from './utils.mjs';
import {
  ensureTsconfigsUpdated,
  filterWorkspacesWithTsconfig,
  getAllNonRootWorkspaces,
  lintTsconfigs,
  printReport,
  readTsconfig,
} from './utils.mjs';

/**
 * Lints the root development, build, and lint TypeScript configs to ensure they
 * reference the expected workspace packages. Optionally fixes any issues
 * found.
 *
 * @param options - The options object.
 * @param options.repoRoot - The root directory of the repository.
 * @param options.shouldFix - Whether to automatically fix issues.
 * @returns `true` if no issues were found, `false` otherwise.
 */
export async function lintRootTsconfigs({
  repoRoot,
  shouldFix,
}: {
  repoRoot: string;
  shouldFix: boolean;
}): Promise<boolean> {
  const workspaces = await getAllNonRootWorkspaces(repoRoot);

  const devAndBuildReport = await lintRootDevAndBuildOnlyTsconfigs({
    repoRoot,
    workspaces,
    shouldFix,
  });
  const lintReport = await lintRootLintOnlyTsconfigs({
    repoRoot,
    workspaces,
    shouldFix,
  });

  return devAndBuildReport.didPass && lintReport.didPass;
}

/**
 * Lints the root development- and build-only TypeScript configs to ensure they
 * reference the expected workspace packages. Optionally fixes any issues found.
 *
 * @param options - The options object.
 * @param options.repoRoot - The root directory of the repository.
 * @param options.workspaces - The workspaces in the repository.
 * @param options.shouldFix - Whether to automatically fix issues.
 * @returns The report resulting from the lint.
 */
export async function lintRootDevAndBuildOnlyTsconfigs({
  repoRoot,
  workspaces,
  shouldFix,
}: {
  repoRoot: string;
  workspaces: Workspaces;
  shouldFix: boolean;
}): Promise<TsconfigLintMetaReport> {
  const devAndBuildTsconfigs = await Promise.all([
    readTsconfig(repoRoot, 'tsconfig.json'),
    readTsconfig(repoRoot, 'tsconfig.build.json'),
  ]);

  const report = shouldFix
    ? await ensureTsconfigsUpdated({
        workspaces: workspaces.list,
        tsconfigs: devAndBuildTsconfigs,
        repoRoot,
        currentWorkspaceRoot: repoRoot,
      })
    : await lintTsconfigs({
        tsconfigs: devAndBuildTsconfigs,
        expectedPackageNames: workspaces.names,
        workspaces,
        repoRoot,
        currentWorkspaceRoot: repoRoot,
      });

  printReport(report);

  return report;
}

/**
 * Lints the root lint-only TypeScript configs to ensure they
 * reference the expected workspace packages. Optionally fixes any issues found.
 *
 * @param options - The options object.
 * @param options.repoRoot - The root directory of the repository.
 * @param options.workspaces - The workspaces in the repository.
 * @param options.shouldFix - Whether to automatically fix issues.
 * @returns The report resulting from the lint.
 */
export async function lintRootLintOnlyTsconfigs({
  repoRoot,
  workspaces,
  shouldFix,
}: {
  repoRoot: string;
  workspaces: Workspaces;
  shouldFix: boolean;
}): Promise<TsconfigLintMetaReport> {
  const lintTsconfig = await readTsconfig(repoRoot, 'tsconfig.lint.json');
  // This allows us to increase linting for the whole repo incrementally.
  const lintWorkspaces = await filterWorkspacesWithTsconfig({
    workspaces: workspaces.list,
    repoRoot,
    fileName: 'tsconfig.lint.json',
  });

  const report = shouldFix
    ? await ensureTsconfigsUpdated({
        workspaces: lintWorkspaces,
        tsconfigs: [lintTsconfig],
        repoRoot,
        currentWorkspaceRoot: repoRoot,
      })
    : await lintTsconfigs({
        tsconfigs: [lintTsconfig],
        expectedPackageNames: new Set(
          lintWorkspaces.map((workspace) => workspace.name),
        ),
        workspaces,
        repoRoot,
        currentWorkspaceRoot: repoRoot,
      });

  printReport(report);

  return report;
}
