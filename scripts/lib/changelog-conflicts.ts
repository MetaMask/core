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

/**
 * Mirrors `@metamask/auto-changelog`'s (unexported) `PackageRename` type.
 */
type PackageRename = {
  versionBeforeRename: string;
  tagPrefixBeforeRename: string;
};

/**
 * Packages that were renamed at some point, and so need
 * `--tag-prefix-before-package-rename`/`--version-before-package-rename`
 * (see their `changelog:update`/`changelog:validate` scripts) to generate
 * correct release-link URLs for releases before the rename. Keep this in
 * sync with those scripts.
 */
const PACKAGE_RENAMES: Record<string, PackageRename> = {
  '@metamask/eth-json-rpc-middleware': {
    tagPrefixBeforeRename: 'eth-json-rpc-middleware@',
    versionBeforeRename: '6.1.0',
  },
  '@metamask/json-rpc-engine': {
    tagPrefixBeforeRename: 'json-rpc-engine@',
    versionBeforeRename: '6.1.0',
  },
  '@metamask/json-rpc-middleware-stream': {
    tagPrefixBeforeRename: 'json-rpc-middleware-stream@',
    versionBeforeRename: '5.0.1',
  },
};

type PackageMetadata = {
  name: string;
  repoUrl: string;
  tagPrefix: string;
  packageRename?: PackageRename;
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
export async function findConflictingChangelogFiles(): Promise<string[]> {
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
    packageRename: PACKAGE_RENAMES[packageJson.name],
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
 * Merge entries from `theirChanges` into `ourChanges`, mutating `ourChanges`
 * in place. An entry only counts as new if it's absent from *both*
 * `ourChanges` and `baseChanges` (the common ancestor) — an entry `theirs`
 * merely inherited unchanged from the common ancestor is not "their" change,
 * so it's never re-added even if `ours` has since evolved past it (e.g. a
 * dependency bump entry that's since been bumped further on `ours`). New
 * breaking changes are inserted below any existing leading breaking changes;
 * other changes are appended to the end. Relative order within
 * `theirChanges` is preserved.
 *
 * @param ourChanges - The category's changes to merge into.
 * @param theirChanges - The category's changes to merge from.
 * @param baseChanges - The category's changes at the common ancestor, used
 * to tell which of `theirChanges` are actually new.
 * @returns The number of new entries added to `ourChanges`.
 */
function mergeCategoryEntries(
  ourChanges: Change[],
  theirChanges: Change[],
  baseChanges: Change[],
): number {
  const initialLength = ourChanges.length;
  const ourKeys = new Set(ourChanges.map(getChangeKey));
  const baseKeys = new Set(baseChanges.map(getChangeKey));

  for (const change of theirChanges) {
    const key = getChangeKey(change);
    if (ourKeys.has(key) || baseKeys.has(key)) {
      continue;
    }

    ourKeys.add(key);

    if (isBreakingChange(change)) {
      const firstNonBreakingIndex = ourChanges.findIndex(
        (entry) => !isBreakingChange(entry),
      );

      const insertIndex =
        firstNonBreakingIndex === -1
          ? ourChanges.length
          : firstNonBreakingIndex;

      ourChanges.splice(insertIndex, 0, change);
    } else {
      ourChanges.push(change);
    }
  }

  return ourChanges.length - initialLength;
}

/**
 * Merge entries from `theirReleaseChanges` into `ourReleaseChanges` across
 * every category `theirs` has entries in, mutating `ourReleaseChanges` in
 * place.
 *
 * @param ourReleaseChanges - The release's changes (by category) to merge
 * into.
 * @param theirReleaseChanges - The release's changes (by category) to merge
 * from.
 * @param baseReleaseChanges - The release's changes (by category) at the
 * common ancestor, used to tell which of `theirReleaseChanges` are actually
 * new.
 * @returns The number of new entries added to `ourReleaseChanges`.
 */
function mergeReleaseChanges(
  ourReleaseChanges: ReleaseChanges,
  theirReleaseChanges: ReleaseChanges,
  baseReleaseChanges: ReleaseChanges,
): number {
  let addedEntriesCount = 0;
  const categories = new Set([
    ...Object.keys(ourReleaseChanges),
    ...Object.keys(theirReleaseChanges),
  ]) as Set<Category>;

  for (const category of categories) {
    const theirEntries = theirReleaseChanges[category] ?? [];
    if (theirEntries.length === 0) {
      continue;
    }

    const categoryAlreadyExisted = category in ourReleaseChanges;
    ourReleaseChanges[category] ??= [];

    const ourCategoryChanges = ourReleaseChanges[category] as Change[];
    addedEntriesCount += mergeCategoryEntries(
      ourCategoryChanges,
      theirEntries,
      baseReleaseChanges[category] ?? [],
    );

    // Avoid leaving behind an empty category header (e.g. `### Changed`)
    // when every one of `theirEntries` turned out to already be present.
    if (!categoryAlreadyExisted && ourCategoryChanges.length === 0) {
      delete ourReleaseChanges[category];
    }
  }

  return addedEntriesCount;
}

/**
 * Parse the changelog content at the common ancestor ("merge base"), so that
 * only entries `theirs` actually added since diverging count as new. Parse
 * failures and a missing/absent `baseContent` (e.g. the file didn't exist at
 * the common ancestor) are tolerated by returning `undefined`, which callers
 * treat as "no known common ancestor" — falling back to a plain two-way
 * union of `ours` and `theirs`.
 *
 * @param baseContent - The changelog content at the common ancestor, if any.
 * @param repoUrl - The GitHub repository URL for the package.
 * @param tagPrefix - The changelog tag prefix for the package.
 * @returns The parsed changelog, or `undefined` if unavailable/unparseable.
 */
function parseBaseChangelog(
  baseContent: string | undefined,
  repoUrl: string,
  tagPrefix: string,
): ReturnType<typeof parseChangelog> | undefined {
  if (baseContent === undefined) {
    return undefined;
  }

  try {
    return parseChangelog({
      changelogContent: baseContent,
      repoUrl,
      tagPrefix,
      shouldExtractPrLinks: true,
    });
  } catch {
    return undefined;
  }
}

/**
 * Merge two conflicting versions of a changelog via a proper three-way
 * merge: only entries `theirs` actually added since the common ancestor
 * (`baseContent`) are merged into `ours`, deduplicated against `ours` by PR
 * number and description together. This means an entry `theirs` merely
 * inherited unchanged from the common ancestor is never re-added, even if
 * `ours` has since evolved past it (e.g. a dependency bump entry that's
 * since been bumped further on `ours`) — avoiding the duplicate entries a
 * plain two-way union would produce. New `**BREAKING:**` entries are placed
 * below existing breaking entries; other new entries are appended.
 *
 * @param options - Options.
 * @param options.ourContent - The changelog content on the "ours" conflict
 * side.
 * @param options.theirContent - The changelog content on the "theirs"
 * conflict side.
 * @param options.baseContent - The changelog content at the common
 * ancestor ("merge base"), if available. Without it, this falls back to a
 * plain two-way union of `ours` and `theirs`.
 * @param options.repoUrl - The GitHub repository URL for the package.
 * @param options.tagPrefix - The changelog tag prefix for the package.
 * @param options.packageRename - The package's rename properties, if it was
 * renamed at some point, so that release links before the rename keep using
 * the old tag prefix. Only affects stringification, so it's only needed for
 * the "ours" side, which is the one that gets stringified.
 * @returns The merged, re-serialized changelog content and the number of new
 * entries that were merged in.
 */
export async function mergeChangelogs({
  ourContent,
  theirContent,
  baseContent,
  repoUrl,
  tagPrefix,
  packageRename,
}: {
  ourContent: string;
  theirContent: string;
  baseContent?: string;
  repoUrl: string;
  tagPrefix: string;
  packageRename?: PackageRename;
}): Promise<{ content: string; mergedEntryCount: number }> {
  // `ourChangelog` is used as the base to mutate and stringify. During a Git
  // merge, `ours` is the current branch (HEAD); during a rebase, it's the
  // upstream branch being rebased onto. In both cases, that's the side more
  // likely to already contain entries also present in `theirs`, so preserving
  // its existing order (and only appending genuinely new entries from `theirs`)
  // produces more intuitive results than the reverse.
  const ourChangelog = parseChangelog({
    changelogContent: ourContent,
    repoUrl,
    tagPrefix,
    packageRename,
    formatter: oxfmt,
    shouldExtractPrLinks: true,
  });

  const theirChangelog = parseChangelog({
    changelogContent: theirContent,
    repoUrl,
    tagPrefix,
    shouldExtractPrLinks: true,
  });

  const baseChangelog = parseBaseChangelog(baseContent, repoUrl, tagPrefix);

  let mergedEntryCount = mergeReleaseChanges(
    ourChangelog.getUnreleasedChanges(),
    theirChangelog.getUnreleasedChanges(),
    baseChangelog?.getUnreleasedChanges() ?? {},
  );

  const oursVersions = new Set(
    ourChangelog.getReleases().map(({ version }) => version),
  );

  for (const theirRelease of theirChangelog.getReleases()) {
    if (!oursVersions.has(theirRelease.version)) {
      // `addRelease` can only add to the very start or end of the release
      // list, so insert at the start and then reposition it into its
      // correct descending-SemVer slot among the existing releases.
      ourChangelog.addRelease(theirRelease);
      const releases = ourChangelog.getReleases();
      const [inserted] = releases.splice(0, 1);

      const sortedIndex = releases.findIndex(({ version }) =>
        gt(inserted.version, version),
      );

      const insertIndex = sortedIndex === -1 ? releases.length : sortedIndex;
      releases.splice(insertIndex, 0, inserted);
    }

    const ourReleaseChanges = ourChangelog.getReleaseChanges(
      theirRelease.version,
    );
    const theirReleaseChanges = theirChangelog.getReleaseChanges(
      theirRelease.version,
    );
    const baseReleaseChanges = baseChangelog?.getReleaseChanges(
      theirRelease.version,
    );

    mergedEntryCount += mergeReleaseChanges(
      ourReleaseChanges,
      theirReleaseChanges ?? {},
      baseReleaseChanges ?? {},
    );
  }

  return {
    content: await ourChangelog.toString(),
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
  const paths = await findConflictingChangelogFiles();
  const resolved: ConflictResolution[] = [];
  const skipped: ConflictSkip[] = [];

  for (const changelogPath of paths) {
    try {
      const [
        oursContent,
        theirsContent,
        baseContent,
        { repoUrl, tagPrefix, packageRename },
      ] = await Promise.all([
        readGitBlob(':2', changelogPath),
        readGitBlob(':3', changelogPath),
        // Stage 1 (the common ancestor) doesn't exist if, e.g., both sides
        // added the file independently — tolerate that and fall back to a
        // two-way union in `mergeChangelogs`.
        readGitBlob(':1', changelogPath).catch(() => undefined),
        resolvePackageMetadata(changelogPath),
      ]);

      const { content, mergedEntryCount } = await mergeChangelogs({
        ourContent: oursContent,
        theirContent: theirsContent,
        baseContent,
        repoUrl,
        tagPrefix,
        packageRename,
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
