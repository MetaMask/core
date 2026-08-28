import type { ReleaseChanges } from '@metamask/auto-changelog';
import { oxfmt, parseChangelog } from '@metamask/auto-changelog';
import { getErrorMessage } from '@metamask/utils';
import execa from 'execa';
import { promises as fs } from 'fs';
import path from 'path';
import { gt } from 'semver';

export const ROOT_WORKSPACE = path.resolve(__dirname, '../..');

const CHANGELOG_PATH_PATTERN = /^packages\/[^/]+\/CHANGELOG\.md$/u;

/**
 * A regular expression for breaking entries. Assumes the entry is in the
 * "**BREAKING**:" or "**BREAKING:**" format.
 */
const BREAKING_CHANGE_PATTERN = /^\*\*BREAKING:?\*\*/u;

type Category = keyof ReleaseChanges;
type Change = NonNullable<ReleaseChanges[Category]>[number];

type PackageJson = {
  name?: string;
  repository?: { url?: string };
};

type PackageMetadata = {
  name: string;
  repoUrl: string;
  tagPrefix: string;
};

type ConflictResolution = {
  /** OS-native path, for display (e.g. in a terminal). */
  path: string;
  mergedEntryCount: number;
};

type ConflictSkip = {
  /** OS-native path, for display (e.g. in a terminal). */
  path: string;
  reason: string;
};

type ConflictResolutionResult = {
  resolved: ConflictResolution[];
  skipped: ConflictSkip[];
};

/**
 * Find `packages/*\/CHANGELOG.md` files that currently have an unresolved
 * Git merge conflict.
 *
 * @returns The repo-relative paths of the conflicted changelog files.
 */
export async function findConflictedChangelogFiles(): Promise<string[]> {
  const { stdout } = await execa(
    'git',
    ['diff', '--name-only', '--diff-filter=U'],
    { cwd: ROOT_WORKSPACE, encoding: 'utf8' },
  );

  return stdout
    .trim()
    .split('\n')
    .filter((filePath) => CHANGELOG_PATH_PATTERN.test(filePath));
}

/**
 * Read a file as it exists at a given Git ref, e.g. a conflict stage such as
 * `:2` (ours) or `:3` (theirs).
 *
 * @param ref - The Git ref to read the file from.
 * @param filePath - The repo-relative path of the file.
 * @returns The contents of the file at that ref.
 */
export async function readGitBlob(
  ref: string,
  filePath: string,
): Promise<string> {
  const { stdout } = await execa('git', ['show', `${ref}:${filePath}`], {
    cwd: ROOT_WORKSPACE,
    encoding: 'utf8',
  });

  return stdout;
}

/**
 * Read and parse a `package.json` file, preferring the working tree copy
 * since it's normally not part of the conflict; if it can't be parsed there
 * (e.g. it's also mid-merge and contains conflict markers), it's re-read
 * from the "ours" conflict stage instead.
 *
 * @param packageJsonPath - The repo-relative path of the `package.json` file.
 * @returns The parsed `package.json` contents.
 */
async function readPackageJson(packageJsonPath: string): Promise<PackageJson> {
  try {
    const content = await fs.readFile(
      path.join(ROOT_WORKSPACE, packageJsonPath),
      'utf8',
    );

    return JSON.parse(content);
  } catch {
    const content = await readGitBlob(':2', packageJsonPath);
    return JSON.parse(content);
  }
}

/**
 * Resolve the package name and repository URL for the package that owns the
 * given changelog file.
 *
 * @param changelogPath - The repo-relative path of the changelog file.
 * @returns The package's name, repository URL, and changelog tag prefix.
 */
export async function resolvePackageMetadata(
  changelogPath: string,
): Promise<PackageMetadata> {
  const packageJsonPath = path.posix.join(
    path.posix.dirname(changelogPath),
    'package.json',
  );

  const packageJson = await readPackageJson(packageJsonPath);
  const repositoryUrl = packageJson.repository?.url;
  if (!packageJson.name || !repositoryUrl) {
    throw new Error(
      `Could not resolve package name or repository for "${changelogPath}".`,
    );
  }

  return {
    name: packageJson.name,
    repoUrl: repositoryUrl.replace(/\.git$/u, ''),
    tagPrefix: `${packageJson.name}@`,
  };
}

/**
 * Determine whether a change entry is a breaking change, per the
 * `**BREAKING:**` description prefix convention.
 *
 * @param change - The change entry.
 * @returns Whether the change is a breaking change.
 */
function isBreakingChange(change: Change): boolean {
  return BREAKING_CHANGE_PATTERN.test(change.description.trim());
}

/**
 * Build a key that identifies "the same change" across both conflict sides.
 * Includes the PR numbers alongside the description, since a single PR can add
 * multiple distinct changelog entries that all reference it.
 *
 * @param change - The change entry.
 * @returns The dedup key for the change.
 */
function getChangeKey(change: Change): string {
  const prKey = [...change.prNumbers].sort().join(',');
  return `${prKey}:${change.description.trim()}`;
}

/**
 * Merge new entries from `incoming` into `base`, mutating `base` in place.
 * Breaking changes are inserted below any existing leading breaking changes;
 * other changes are appended to the end. Relative order within `incoming` is
 * preserved.
 *
 * @param base - The category's changes to merge into.
 * @param incoming - The category's changes to merge from.
 * @returns The number of new entries added to `base`.
 */
function mergeCategoryEntries(base: Change[], incoming: Change[]): number {
  const initialLength = base.length;
  const existingKeys = new Set(base.map(getChangeKey));

  for (const change of incoming) {
    const key = getChangeKey(change);
    if (existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);

    if (isBreakingChange(change)) {
      const firstNonBreakingIndex = base.findIndex(
        (entry) => !isBreakingChange(entry),
      );

      const insertIndex =
        firstNonBreakingIndex === -1 ? base.length : firstNonBreakingIndex;

      base.splice(insertIndex, 0, change);
    } else {
      base.push(change);
    }
  }

  return base.length - initialLength;
}

/**
 * Merge new entries from `incoming` into `base` across every category
 * present on either side, mutating `base` in place.
 *
 * @param base - The release's changes (by category) to merge into.
 * @param incoming - The release's changes (by category) to merge from.
 * @returns The number of new entries added to `base`.
 */
function mergeReleaseChanges(
  base: ReleaseChanges,
  incoming: ReleaseChanges,
): number {
  let addedCount = 0;
  const categories = new Set([
    ...Object.keys(base),
    ...Object.keys(incoming),
  ]) as Set<Category>;

  for (const category of categories) {
    const incomingEntries = incoming[category] ?? [];
    if (incomingEntries.length === 0) {
      continue;
    }

    base[category] ??= [];

    addedCount += mergeCategoryEntries(
      base[category] as Change[],
      incomingEntries,
    );
  }

  return addedCount;
}

/**
 * Merge two conflicting versions of a changelog by taking the union of their
 * entries: every entry unique to either side is kept, deduplicated by PR
 * number and description together, with new `**BREAKING:**` entries placed
 * below existing breaking entries and other new entries appended.
 *
 * @param options - Options.
 * @param options.oursContent - The changelog content on the "ours" conflict
 * side.
 * @param options.theirsContent - The changelog content on the "theirs"
 * conflict side.
 * @param options.repoUrl - The GitHub repository URL for the package.
 * @param options.tagPrefix - The changelog tag prefix for the package.
 * @returns The merged, re-serialized changelog content and the number of new
 * entries that were merged in.
 */
export async function mergeChangelogs({
  oursContent,
  theirsContent,
  repoUrl,
  tagPrefix,
}: {
  oursContent: string;
  theirsContent: string;
  repoUrl: string;
  tagPrefix: string;
}): Promise<{ content: string; mergedEntryCount: number }> {
  // `ours` is used as the base to mutate and stringify. During a Git merge,
  // `ours` is the current branch (HEAD); during a rebase, it's the upstream
  // branch being rebased onto. In both cases, that's the side more likely to
  // already contain entries also present in `theirs`, so preserving its
  // existing order (and only appending genuinely new entries from `theirs`)
  // produces more intuitive results than the reverse.
  const ours = parseChangelog({
    changelogContent: oursContent,
    repoUrl,
    tagPrefix,
    formatter: oxfmt,
    shouldExtractPrLinks: true,
  });

  const theirs = parseChangelog({
    changelogContent: theirsContent,
    repoUrl,
    tagPrefix,
    shouldExtractPrLinks: true,
  });

  let mergedEntryCount = mergeReleaseChanges(
    ours.getUnreleasedChanges(),
    theirs.getUnreleasedChanges(),
  );

  const oursVersions = new Set(
    ours.getReleases().map(({ version }) => version),
  );

  for (const theirsRelease of theirs.getReleases()) {
    if (!oursVersions.has(theirsRelease.version)) {
      // `addRelease` can only add to the very start or end of the release
      // list, so insert at the start and then reposition it into its
      // correct descending-SemVer slot among the existing releases.
      ours.addRelease(theirsRelease);
      const releases = ours.getReleases();
      const [inserted] = releases.splice(0, 1);

      const sortedIndex = releases.findIndex(({ version }) =>
        gt(inserted.version, version),
      );

      const insertIndex = sortedIndex === -1 ? releases.length : sortedIndex;
      releases.splice(insertIndex, 0, inserted);
    }

    const oursReleaseChanges = ours.getReleaseChanges(theirsRelease.version);
    const theirsReleaseChanges = theirs.getReleaseChanges(
      theirsRelease.version,
    );
    mergedEntryCount += mergeReleaseChanges(
      oursReleaseChanges,
      theirsReleaseChanges ?? {},
    );
  }

  return {
    content: await ours.toString(),
    mergedEntryCount,
  };
}

/**
 * Find every conflicted `packages/*\/CHANGELOG.md` file, resolve as many as
 * possible via {@link mergeChangelogs}, and write the merged result back to
 * the working tree (without staging it, so it can still be reviewed before
 * committing). Files that can't be automatically merged (e.g. a
 * structurally invalid side) are left with their conflict markers intact.
 *
 * @returns The set of files that were resolved and the set that were
 * skipped, along with the reason for each skip.
 */
export async function resolveChangelogConflicts(): Promise<ConflictResolutionResult> {
  const paths = await findConflictedChangelogFiles();
  const resolved: ConflictResolution[] = [];
  const skipped: ConflictSkip[] = [];

  for (const changelogPath of paths) {
    try {
      const [oursContent, theirsContent, { repoUrl, tagPrefix }] =
        await Promise.all([
          readGitBlob(':2', changelogPath),
          readGitBlob(':3', changelogPath),
          resolvePackageMetadata(changelogPath),
        ]);

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl,
        tagPrefix,
      });

      await fs.writeFile(
        path.join(ROOT_WORKSPACE, changelogPath),
        content,
        'utf8',
      );

      resolved.push({
        path: path.normalize(changelogPath),
        mergedEntryCount,
      });
    } catch (error) {
      skipped.push({
        path: path.normalize(changelogPath),
        reason: getErrorMessage(error),
      });
    }
  }

  return { resolved, skipped };
}
