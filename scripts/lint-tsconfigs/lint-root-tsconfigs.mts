import {
  ensureTsconfigsUpdated,
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

  const tsconfigs = await Promise.all([
    readTsconfig(repoRoot, 'tsconfig.json'),
    readTsconfig(repoRoot, 'tsconfig.build.json'),
    readTsconfig(repoRoot, 'tsconfig.lint.json'),
  ]);

  const report = shouldFix
    ? await ensureTsconfigsUpdated({
        workspaces: workspaces.list,
        tsconfigs,
        repoRoot,
        currentWorkspaceRoot: repoRoot,
      })
    : await lintTsconfigs({
        tsconfigs,
        expectedPackageNames: workspaces.names,
        workspaces,
        repoRoot,
        currentWorkspaceRoot: repoRoot,
      });

  printReport(report);

  return report.didPass;
}
