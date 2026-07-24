import type { TsconfigLintMetaReport } from './utils.mjs';
import {
  ensureTsconfigsUpdated,
  getAllNonRootWorkspaces,
  lintTsconfigs,
  printReport,
  readTsconfig,
} from './utils.mjs';

/**
 * Lints the root tsconfig.json and tsconfig.build.json files to ensure they
 * reference all workspace packages. Optionally fixes any issues found.
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
  const tsconfigs = await Promise.all([
    readTsconfig(repoRoot, 'tsconfig.json'),
    readTsconfig(repoRoot, 'tsconfig.build.json'),
  ]);

  let report: TsconfigLintMetaReport;
  if (shouldFix) {
    report = await ensureTsconfigsUpdated({
      workspaces: workspaces.list,
      tsconfigs,
      repoRoot,
      currentWorkspaceRoot: repoRoot,
    });
  } else {
    report = await lintTsconfigs({
      tsconfigs,
      expectedPackageNames: workspaces.names,
      workspaces,
      repoRoot,
      currentWorkspaceRoot: repoRoot,
    });
  }

  printReport(report);

  return report.didPass;
}
