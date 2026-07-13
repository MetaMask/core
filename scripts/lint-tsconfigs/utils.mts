import { readJsonFile, readFile } from '@metamask/utils/node';
import * as commentJson from 'comment-json';
import execa from 'execa';
import fs from 'fs';
import type { FormatConfig } from 'oxfmt';
import { format as oxfmtFormat } from 'oxfmt';
import path from 'path';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');

/**
 * A Yarn workspace as returned by `yarn workspaces list`.
 */
export type Workspace = {
  location: string;
  name: string;
};

/**
 * The collection of all workspaces in this repo, and various ways to access
 * them.
 */
export type Workspaces = {
  names: Set<string>;
  list: Workspace[];
  byName: Map<string, Workspace>;
  byAbsolutePath: Map<string, Workspace>;
};

/**
 * The content of a `package.json`, whether at the root level or package level.
 */
export type PackageManifest = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  private?: boolean;
  workspaces?: string[];
};

/**
 * An object in the `references` field in a TypeScript config file.
 */
export type TsconfigReference = { path: string };

/**
 * The content of a TypeScript config file.
 */
export type TsconfigContent = {
  references?: readonly TsconfigReference[];
};

/**
 * Information about a TypeScript config file, including its content.
 */
export type Tsconfig = {
  filePath: string;
  fileName: string;
  content: TsconfigContent;
};

/**
 * The result after linting a TypeScript config file.
 */
export type TsconfigLintReport = {
  missingReferencePaths: readonly string[];
  extraReferencePaths: readonly string[];
  didChange: boolean;
};

/**
 * The result after linting all TypeScript config files across the repo.
 */
export type TsconfigLintMetaReport = {
  didPass: boolean;
  didApplyFixes: boolean;
  byTsconfig: Map<Tsconfig, TsconfigLintReport>;
};

/**
 * Returns all non-root Yarn workspaces keyed by package name.
 *
 * @param repoRoot - The root directory of the repository.
 * @returns Three ways to work with the workspaces: as an array, as a map keyed
 * by name, as a map keyed by absolute path.
 */
export async function getAllNonRootWorkspaces(
  repoRoot: string,
): Promise<Workspaces> {
  const { stdout } = await execa('yarn', ['workspaces', 'list', '--json']);

  const lines = stdout.split('\n').filter((line) => line.trim() !== '');
  const allWorkspaces = lines.map((line) => JSON.parse(line) as Workspace);
  const nonRootSortedWorkspaces = allWorkspaces
    .filter((workspace) => workspace.location !== '.')
    .sort((a, b) => a.name.localeCompare(b.name));

  const workspacesByName = new Map(
    nonRootSortedWorkspaces.map(
      (workspace) => [workspace.name, workspace] as const,
    ),
  );
  const names = new Set(workspacesByName.keys());

  const workspacesByAbsolutePath = new Map<string, Workspace>();
  for (const workspace of nonRootSortedWorkspaces) {
    const workspaceAbsolutePath = path.resolve(repoRoot, workspace.location);
    workspacesByAbsolutePath.set(workspaceAbsolutePath, workspace);
  }

  return {
    names,
    list: nonRootSortedWorkspaces,
    byName: workspacesByName,
    byAbsolutePath: workspacesByAbsolutePath,
  };
}

/**
 * Reads and parses a package manifest from a package root directory.
 *
 * @param packageRoot - Absolute path to the package directory.
 * @returns The parsed `package.json` contents.
 */
export async function readPackageManifest(
  packageRoot: string,
): Promise<PackageManifest> {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  return await readJsonFile<PackageManifest>(packageJsonPath);
}

/**
 * Reads and parses a TypeScript config file and returns path metadata.
 *
 * @param directory - Where to find the tsconfig file.
 * @param fileName - The path to the tsconfig file in the directory.
 * @returns Parsed tsconfig content with absolute and relative paths.
 */
export async function readTsconfig(
  directory: string,
  fileName: string,
): Promise<Tsconfig> {
  const filePath = path.join(directory, fileName);
  const rawContent = await readFile(filePath);
  return {
    filePath,
    fileName,
    content: commentJson.parse(rawContent) as TsconfigContent,
  };
}

/**
 * Resolves a reference path inside of a tsconfig file to its TypeScript
 * "project" directory (i.e., the same directory that the tsconfig file lives
 * in).
 *
 * Handles both direct directory references (e.g. `../../accounts-controller/`)
 * and references to specific tsconfig files
 * (`../../accounts-controller/tsconfig.json`).
 *
 * @param referencePath - The reference path from the tsconfig.
 * @param tsconfigPath - Path to the tsconfig file containing the reference.
 * @returns The absolute path to the workspace directory.
 */
async function resolveTsconfigReferenceToTsProjectDirectory(
  referencePath: string,
  tsconfigPath: string,
): Promise<string> {
  const absoluteReferencePath = path.resolve(
    path.dirname(tsconfigPath),
    referencePath,
  );

  const stats = await fs.promises.stat(absoluteReferencePath);
  if (stats.isFile()) {
    return path.dirname(absoluteReferencePath);
  }
  return absoluteReferencePath;
}

/**
 * Extracts the workspace package names from the references in a tsconfig file.
 *
 * @param args - The arguments to this function.
 * @param args.tsconfig - Parsed contents of the tsconfig file.
 * @param args.workspaces - The workspaces to use as references.
 * @returns A set of package names that are referenced in the tsconfig.
 */
async function getReferencedPackageNamesFromTsconfigFile({
  tsconfig,
  workspaces,
}: {
  tsconfig: Tsconfig;
  workspaces: Workspaces;
}): Promise<Set<string>> {
  const packageNames = new Set<string>();

  for (const reference of tsconfig.content.references ?? []) {
    const tsProjectAbsolutePath =
      await resolveTsconfigReferenceToTsProjectDirectory(
        reference.path,
        tsconfig.filePath,
      );
    const workspace = workspaces.byAbsolutePath.get(tsProjectAbsolutePath);
    if (workspace) {
      packageNames.add(workspace.name);
    } else {
      throw new Error(
        `Error parsing tsconfig ${tsconfig.fileName}: Could not resolve reference to workspace: ${reference.path}`,
      );
    }
  }

  return packageNames;
}

/**
 * Computes the expected reference path for a workspace within a tsconfig file.
 *
 * Note if the file is `tsconfig.json`, we drop the trailing `/tsconfig.json`
 * from the reference path.
 *
 * @param args - The arguments to this function.
 * @param args.workspace - The workspace to compute the path for.
 * @param args.tsconfig - The tsconfig file to compute the path relative to.
 * @param args.repoRoot - The root directory of the repository.
 * @param args.currentWorkspaceRoot - The directory containing the tsconfig file.
 * @returns The expected reference path string.
 */
function getExpectedReferencePath({
  workspace,
  tsconfig,
  repoRoot,
  currentWorkspaceRoot,
}: {
  workspace: Workspace;
  tsconfig: Tsconfig;
  repoRoot: string;
  currentWorkspaceRoot: string;
}): string {
  const absoluteWorkspacePath = path.resolve(repoRoot, workspace.location);
  const relativeWorkspacePath = path.relative(
    currentWorkspaceRoot,
    absoluteWorkspacePath,
  );
  const prefixedRelativePath = relativeWorkspacePath.startsWith('..')
    ? relativeWorkspacePath
    : `./${relativeWorkspacePath}`;
  if (tsconfig.fileName === 'tsconfig.json') {
    return prefixedRelativePath;
  }
  return `${prefixedRelativePath}/${tsconfig.fileName}`;
}

/**
 * Compares the references in a tsconfig file against expected package names.
 *
 * @param args - The arguments to this function.
 * @param args.tsconfig - Parsed contents of the tsconfig file.
 * @param args.expectedPackageNames - Package names that should be referenced.
 * @param args.workspaces - The workspaces to use as reference.
 * @param args.repoRoot - The root directory of the repository.
 * @param args.currentWorkspaceRoot - The directory containing the tsconfig file.
 * @returns Missing and extra reference paths for the tsconfig.
 */
export async function lintTsconfig({
  tsconfig,
  expectedPackageNames,
  workspaces,
  repoRoot,
  currentWorkspaceRoot,
}: {
  tsconfig: Tsconfig;
  expectedPackageNames: Set<string>;
  workspaces: Workspaces;
  repoRoot: string;
  currentWorkspaceRoot: string;
}): Promise<TsconfigLintReport> {
  const actualPackageNames = await getReferencedPackageNamesFromTsconfigFile({
    tsconfig,
    workspaces,
  });

  const missingReferencePaths = [...expectedPackageNames]
    .filter((name) => !actualPackageNames.has(name))
    .toSorted()
    .map((name) => {
      const workspace = workspaces.byName.get(name);
      if (!workspace) {
        throw new Error(`Expected workspace not found for package: ${name}`);
      }
      return getExpectedReferencePath({
        workspace,
        tsconfig,
        repoRoot,
        currentWorkspaceRoot,
      });
    });

  const extraReferencePaths = [...actualPackageNames]
    .filter((name) => !expectedPackageNames.has(name))
    .toSorted()
    .map((name) => {
      const workspace = workspaces.byName.get(name);
      if (!workspace) {
        throw new Error(`Expected workspace not found for package: ${name}`);
      }
      return getExpectedReferencePath({
        workspace,
        tsconfig,
        repoRoot,
        currentWorkspaceRoot,
      });
    });

  return { missingReferencePaths, extraReferencePaths, didChange: false };
}

/**
 * Checks for issues in the given tsconfig files.
 *
 * @param args - The arguments to this function.
 * @param args.tsconfigs - The parsed tsconfigs to check.
 * @param args.expectedPackageNames - Package names that should be referenced.
 * @param args.workspaces - The workspaces to use as references.
 * @param args.repoRoot - The root directory of the repository.
 * @param args.currentWorkspaceRoot - The directory containing the tsconfig files.
 * @returns A report for each tsconfig file (i.e., an object keyed by the
 * tsconfig filename which contains issues).
 */
export async function lintTsconfigs({
  tsconfigs,
  expectedPackageNames,
  workspaces,
  repoRoot,
  currentWorkspaceRoot,
}: {
  tsconfigs: Tsconfig[];
  expectedPackageNames: Set<string>;
  workspaces: Workspaces;
  repoRoot: string;
  currentWorkspaceRoot: string;
}): Promise<TsconfigLintMetaReport> {
  const results = await Promise.all(
    tsconfigs.map(async (tsconfig) => {
      const report = await lintTsconfig({
        tsconfig,
        expectedPackageNames,
        workspaces,
        repoRoot,
        currentWorkspaceRoot,
      });
      return [tsconfig, report] as const;
    }),
  );
  const byTsconfig = new Map(results);
  const didPass = results.every(
    ([, report]) =>
      report.missingReferencePaths.length === 0 &&
      report.extraReferencePaths.length === 0,
  );
  return { didPass, didApplyFixes: false, byTsconfig };
}

/**
 * Normalizes a tsconfig reference path to a bare directory path for
 * comparison purposes, by stripping a trailing `/tsconfig.json` suffix if
 * present. This allows existing references that use explicit file paths (e.g.
 * `../foo/tsconfig.json`) to be matched against canonical bare-directory paths
 * (e.g. `../foo`).
 *
 * @param refPath - The reference path to normalize.
 * @returns The normalized path.
 */
function normalizeReferencePath(refPath: string): string {
  return refPath.replace(/\/tsconfig\.json$/u, '');
}

/**
 * Produces an updated `references` list within a tsconfig file that preserves
 * the order of existing references, removes extras, and adds missing ones in
 * the order they appear in `newReferences`.
 *
 * @param currentReferences - The references currently in the tsconfig file.
 * @param newReferences - The complete desired set of references.
 * @returns The merged references list.
 */
function mergeReferences(
  currentReferences: readonly TsconfigReference[],
  newReferences: readonly TsconfigReference[],
): TsconfigReference[] {
  const currentNormalizedPaths = new Set(
    currentReferences.map((ref) => normalizeReferencePath(ref.path)),
  );
  const newReferencesByNormalizedPath = new Map(
    newReferences.map((ref) => [normalizeReferencePath(ref.path), ref]),
  );

  // Keep existing references that are still valid, replacing them with the
  // canonical form from newReferences.
  const keptReferences = currentReferences
    .map((ref) =>
      newReferencesByNormalizedPath.get(normalizeReferencePath(ref.path)),
    )
    .filter((ref): ref is TsconfigReference => ref !== undefined);

  // Append new references that aren't already present.
  const addedReferences = newReferences.filter(
    (ref) => !currentNormalizedPaths.has(normalizeReferencePath(ref.path)),
  );

  return [...keptReferences, ...addedReferences];
}

/**
 * Determines whether two reference lists are equivalent, i.e. they contain
 * the same paths in the same order.
 *
 * @param referencesA - The first list of references.
 * @param referencesB - The second list of references.
 * @returns `true` if the two lists contain the same paths in the same order.
 */
function areReferencesEqual(
  referencesA: readonly TsconfigReference[],
  referencesB: readonly TsconfigReference[],
): boolean {
  return (
    referencesA.length === referencesB.length &&
    referencesA.every((reference, index) => {
      return reference.path === referencesB[index]?.path;
    })
  );
}

/**
 * Updates the given tsconfig file to reference all of the given workspace
 * packages, preserving the existing order of references and appending any
 * missing ones in alphabetical order. Updates the formatting of the file to
 * appease Oxfmt if necessary.
 *
 * @param args - The arguments to this function.
 * @param args.tsconfig - Parsed tsconfig file to update.
 * @param args.workspaces - Workspaces to update the file with.
 * @param args.repoRoot - The path to the whole repository
 * @param args.currentWorkspaceRoot - The path to the current workspace (the
 * root of the repository or the path to a package within it).
 * @returns `true` if the tsconfig file's contents were changed, `false`
 * otherwise.
 */
async function ensureTsconfigUpdated({
  tsconfig,
  workspaces,
  repoRoot,
  currentWorkspaceRoot,
}: {
  tsconfig: Tsconfig;
  workspaces: Workspace[];
  repoRoot: string;
  currentWorkspaceRoot: string;
}): Promise<boolean> {
  const currentReferences = tsconfig.content.references ?? [];
  const expectedReferences = workspaces.map((workspace) => ({
    path: getExpectedReferencePath({
      workspace,
      tsconfig,
      repoRoot,
      currentWorkspaceRoot,
    }),
  }));
  const newReferences = mergeReferences(currentReferences, expectedReferences);

  // If the references haven't changed, then there's no need to reformat and
  // rewrite the file, even if its current formatting doesn't match Oxfmt.
  if (areReferencesEqual(currentReferences, newReferences)) {
    return false;
  }

  const oxfmtRc = (await import(
    path.join(REPO_ROOT, '.oxfmtrc.json')
  )) as FormatConfig;
  const updatedContent = commentJson.stringify(
    commentJson.assign(tsconfig.content, { references: [...newReferences] }),
    null,
    2,
  );
  const { code: updatedFormattedContent, errors } = await oxfmtFormat(
    tsconfig.fileName,
    updatedContent,
    oxfmtRc,
  );
  if (errors.length > 0) {
    throw new Error(
      `Failed to format ${tsconfig.fileName} with Oxfmt: ${errors.map((error) => error.message).join('; ')}`,
    );
  }

  await fs.promises.writeFile(tsconfig.filePath, updatedFormattedContent);
  return true;
}

/**
 * Updates the given tsconfig files to reference the given workspace packages,
 * preserving the existing order of references and appending any missing ones
 * in alphabetical order.
 *
 * @param args - The arguments to this function.
 * @param args.tsconfigs - Parsed tsconfig files.
 * @param args.workspaces - The workspaces to use.
 * @param args.repoRoot - The path to the whole repository
 * @param args.currentWorkspaceRoot - The path to the current workspace (the
 * root of the repository or the path to a package within it).
 * @returns A report for each tsconfig file (i.e., an object keyed by the
 * tsconfig filename which indicates whether its contents were changed).
 */
export async function ensureTsconfigsUpdated({
  tsconfigs,
  workspaces,
  repoRoot,
  currentWorkspaceRoot,
}: {
  tsconfigs: Tsconfig[];
  workspaces: Workspace[];
  repoRoot: string;
  currentWorkspaceRoot: string;
}): Promise<TsconfigLintMetaReport> {
  const byTsconfig = new Map(
    await Promise.all(
      tsconfigs.map(async (tsconfig) => {
        const didChange = await ensureTsconfigUpdated({
          tsconfig,
          workspaces,
          repoRoot,
          currentWorkspaceRoot,
        });
        const report: TsconfigLintReport = {
          missingReferencePaths: [],
          extraReferencePaths: [],
          didChange,
        };
        return [tsconfig, report] as const;
      }),
    ),
  );

  return {
    didPass: true,
    didApplyFixes: true,
    byTsconfig,
  };
}

/**
 * Prints the results from linting tsconfig files (i.e., whether issues were
 * found or not, and if so, what they were).
 *
 * @param metaReport - The report to print (includes all tsconfigs linted).
 */
export function printReport(metaReport: TsconfigLintMetaReport): void {
  if (metaReport.didApplyFixes) {
    for (const [tsconfig, report] of metaReport.byTsconfig.entries()) {
      if (report.didChange) {
        console.log(
          `✅ Updated ${tsconfig.fileName} so all references now match dependencies.`,
        );
      } else {
        console.log(`ℹ️ ${tsconfig.fileName} already up to date.`);
      }
    }
    return;
  }

  for (const [tsconfig, report] of metaReport.byTsconfig.entries()) {
    if (
      report.missingReferencePaths.length === 0 &&
      report.extraReferencePaths.length === 0
    ) {
      console.log(
        `✅ No issues detected within ${tsconfig.fileName}. Good job!`,
      );
    } else {
      console.log(
        `❌ Detected the following issues within ${tsconfig.fileName}:`,
      );
      for (const referencePath of report.missingReferencePaths) {
        console.log(`  - Missing reference: \`${referencePath}\``);
      }
      for (const referencePath of report.extraReferencePaths) {
        console.log(`  - Unnecessary reference: \`${referencePath}\``);
      }
    }
  }

  if (!metaReport.didPass) {
    console.log(
      '\nYou can run `yarn workspace <workspace> run lint:tsconfigs:fix` or `yarn run lint:tsconfigs:fix:all` to quickly fix these issues.',
    );
  }
}
