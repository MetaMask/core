import type { TsconfigLintMetaReport } from './utils';
import {
  getAllNonRootWorkspaces,
  lintTsconfigs,
  printReport,
  readTsconfig,
  updateReferencesInTsconfigs,
} from './utils';

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
    await updateReferencesInTsconfigs({
      workspaces: workspaces.list,
      tsconfigs,
      repoRoot,
      currentWorkspaceRoot: repoRoot,
    });
    report = {
      didPass: true,
      didApplyFixes: true,
      byTsconfig: new Map(
        tsconfigs.map((tsconfig) => [
          tsconfig,
          { missingReferencePaths: [], extraReferencePaths: [] },
        ]),
      ),
    };
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
