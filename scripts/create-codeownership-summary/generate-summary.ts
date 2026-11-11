import { execa } from 'execa';
import ignore from 'ignore';

import { assembleCodeownersSections } from '../manage-codeowners/assemble.ts';
import type {
  CodeownersConfig,
  CodeownersRule,
  CodeownersSection,
} from '../manage-codeowners/types.ts';

/**
 * Leaves room below GitHub's comment size limit for the workflow's comment
 * marker and truncation notices.
 */
const MAX_SUMMARY_LENGTH = 60_000;

/**
 * A changed file and the CODEOWNERS rule that determines its owners.
 */
type MatchedFile = {
  /**
   * Repository-relative path of the changed file.
   */
  filePath: string;
  /**
   * The last rule whose pattern matches the file, which GitHub uses.
   */
  codeownerRule: CodeownersRule;
};

/**
 * Files with the same set of eligible codeowners.
 */
type CodeownershipGroup = {
  /**
   * Sorted, unique owners; any one can approve the group's files.
   */
  owners: string[];
  /**
   * Repository-relative paths of the changed files assigned exclusively to
   * this group.
   */
  filePaths: string[];
};

/**
 * Generate a Markdown summary of which codeowners own the files changed on a
 * branch. The summary is what the Post Codeownership Summary workflow posts on
 * pull requests.
 *
 * Files are grouped by the exact set of teams whose approval is needed. Core
 * Platform co-owns some files in every package, such as changelogs and
 * manifests, but the package's own teams can approve changes to them, so those
 * files are grouped with the package's teams and listed again in a separate,
 * informational section.
 *
 * @param options - The options.
 * @param options.repositoryDirectoryPath - A directory within the Git
 * repository to inspect.
 * @param options.baseRef - The branch being merged into.
 * @param options.headRef - The branch being merged.
 * @param options.codeownersConfig - The configuration that
 * `.github/CODEOWNERS` is generated from.
 * @returns The summary, or an empty string if no changed files have owners.
 */
export async function generateCodeownershipSummary({
  repositoryDirectoryPath,
  baseRef,
  headRef,
  codeownersConfig,
}: {
  repositoryDirectoryPath: string;
  baseRef: string;
  headRef: string;
  codeownersConfig: CodeownersConfig;
}): Promise<string> {
  const changedFilePaths = await listChangedFilePaths({
    repositoryDirectoryPath,
    baseRef,
    headRef,
  });
  const codeownerRules = getFlatCodeownerRules(
    assembleCodeownersSections(codeownersConfig),
  );
  const matchedFiles = matchFilesToCodeownerRules(
    changedFilePaths,
    codeownerRules,
  );
  const codeownershipGroups = groupFilesByOwners(matchedFiles);
  const coOwnedFilePaths = matchedFiles
    .filter(({ codeownerRule }) => codeownerRule.primaryOwners !== undefined)
    .map(({ filePath }) => filePath);

  return codeownershipGroups.length > 0
    ? renderSummary({ codeownershipGroups, coOwnedFilePaths })
    : '';
}

/**
 * List rules in the order they appear in `.github/CODEOWNERS`.
 *
 * @param sections - Sections assembled from `codeowners.ts`.
 * @returns Rules in precedence order, with later rules winning.
 */
function getFlatCodeownerRules(
  sections: CodeownersSection[],
): CodeownersRule[] {
  return sections.flatMap((section) => [
    ...section.rules,
    ...getFlatCodeownerRules(section.subsections ?? []),
  ]);
}

/**
 * Find the codeowner rule that determines the owners of each changed file.
 *
 * @param changedFilePaths - Repository-relative paths of changed files.
 * @param codeownerRules - Ownership rules in precedence order.
 * @returns The changed files that match a rule, along with that rule.
 */
function matchFilesToCodeownerRules(
  changedFilePaths: string[],
  codeownerRules: CodeownersRule[],
): MatchedFile[] {
  const codeownerMatchers = codeownerRules
    .map((codeownerRule) => ({
      matches: createPatternMatcher(codeownerRule.pattern),
      codeownerRule,
    }))
    // In a CODEOWNERS file, if multiple patterns match a file, the last pattern
    // wins. Here, reversing the list of matchers is more optimal, because as
    // soon as we find a match, we can stop looping.
    .reverse();

  return changedFilePaths.flatMap((filePath) => {
    const codeownerMatcher = codeownerMatchers.find(({ matches }) =>
      matches(filePath),
    );
    return codeownerMatcher
      ? [{ filePath, codeownerRule: codeownerMatcher.codeownerRule }]
      : [];
  });
}

/**
 * Group changed files by the teams whose approval is needed for them: the
 * primary owners of a rule, if it has them, or else all of its owners.
 *
 * @param matchedFiles - Changed files and the rules that determine their
 * owners.
 * @returns Groups of changed files ordered by their owners.
 */
function groupFilesByOwners(matchedFiles: MatchedFile[]): CodeownershipGroup[] {
  const groups = new Map<string, CodeownershipGroup>();
  for (const { filePath, codeownerRule } of matchedFiles) {
    const owners = [
      ...new Set(codeownerRule.primaryOwners ?? codeownerRule.owners),
    ].sort();
    if (owners.length === 0) {
      continue;
    }
    const key = JSON.stringify(owners);
    let group = groups.get(key);
    if (!group) {
      group = { owners, filePaths: [] };
      groups.set(key, group);
    }
    group.filePaths.push(filePath);
  }

  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, group]) => group);
}

/**
 * Create a function that tests whether a path matches a CODEOWNERS pattern.
 *
 * @param pattern - A pattern from a CODEOWNERS rule.
 * @returns A function that returns whether a repository-relative path matches
 * the pattern.
 */
function createPatternMatcher(pattern: string): (filePath: string) => boolean {
  // This is admittedly confusing. If we want to know whether `filePath` matches
  // `pattern`, why are we using `ignore`/`ignores`?
  //
  // We're using the `ignore` dependency to parse patterns that appear in
  // GitHub's CODEOWNERS file. The `ignore` package was originally built to
  // support Git's `.gitignore` files. Essentially, then, we're pretending that
  // we are parsing such a file and that we want to test whether a file path
  // matches one of the ignore patterns. (Other packages such as
  // `codeowners-utils` and `@snyk/github-codeowners` also use this dependency
  // to parse CODEOWNERS patterns, so it's not *completely* out of the norm.)
  const matcher = ignore({ ignorecase: false }).add(pattern);
  return (filePath) => matcher.ignores(filePath);
}

/**
 * List the files changed on the head ref since it diverged from the base ref,
 * as GitHub does for a pull request.
 *
 * @param options - The options.
 * @param options.repositoryDirectoryPath - A directory within the Git
 * repository to inspect.
 * @param options.baseRef - The branch being merged into.
 * @param options.headRef - The branch being merged.
 * @returns Repository-relative paths of the changed files. A renamed file is
 * listed under both its old and new paths, since both paths may have owners.
 */
async function listChangedFilePaths({
  repositoryDirectoryPath,
  baseRef,
  headRef,
}: {
  repositoryDirectoryPath: string;
  baseRef: string;
  headRef: string;
}): Promise<string[]> {
  const { stdout } = await execa(
    'git',
    [
      'diff',
      '--name-only',
      '-z',
      '--no-renames',
      // Use three dots so Git computes the merge base automatically and uses it
      // for comparison. This obviates the need to compute this in the workflow.
      `${baseRef}...${headRef}`,
    ],
    { cwd: repositoryDirectoryPath, stripFinalNewline: false },
  );
  return stdout.split('\0').filter((filePath) => filePath !== '');
}

/**
 * Build the Markdown-formatted string that will be used to post a comment on a
 * PR. It has two sections: first a list of changed files for each set of
 * primary owners (whose approval is required), then the files co-owned by Core
 * Platform (whose approval is not required).
 *
 * @param options - The options.
 * @param options.codeownershipGroups - Mutually exclusive ownership groups.
 * @param options.coOwnedFilePaths - Changed files that Core Platform co-owns.
 * @returns A Markdown summary short enough to post as a GitHub comment.
 */
function renderSummary({
  codeownershipGroups,
  coOwnedFilePaths,
}: {
  codeownershipGroups: CodeownershipGroup[];
  coOwnedFilePaths: string[];
}): string {
  let summary = `## 🛑 Files requiring codeowner review

${renderApprovalInstructions(codeownershipGroups)}
`;
  const sections = codeownershipGroups.map(renderCodeownershipGroup);
  if (coOwnedFilePaths.length > 0) {
    sections.push(renderCorePlatformCoOwnedFiles(coOwnedFilePaths));
  }

  for (const section of sections) {
    if (summary.length + section.length > MAX_SUMMARY_LENGTH) {
      summary +=
        '\n> ⚠️ Remaining file groups omitted because this summary reached the comment size limit. Run `yarn create-codeownership-summary` to see the full summary.\n';
      break;
    }
    summary += section;
  }
  return summary;
}

/**
 * Explain whose approvals are needed to merge.
 *
 * @param codeownershipGroups - Mutually exclusive ownership groups.
 * @returns The explanation, in Markdown.
 */
function renderApprovalInstructions(
  codeownershipGroups: CodeownershipGroup[],
): string {
  if (codeownershipGroups.some(({ owners }) => owners.length > 1)) {
    return `To merge this PR, you'll need to get approvals from the following owner groups.
**For files with multiple owners, approval from one owner is sufficient.**`;
  }
  return "To merge this PR, you'll need to get approvals from the following owners.";
}

/**
 * Render a group of files, headered by the owners.
 *
 * @param group - Owners and their changed files.
 * @returns A Markdown section.
 */
function renderCodeownershipGroup(group: CodeownershipGroup): string {
  const owners = group.owners.map((owner) => `**${owner}**`).join(' _or_ ');
  return `
${owners} (${describeNumberOfFiles(group.filePaths)})

${renderFileList(group.filePaths)}`;
}

/**
 * Render the files co-owned by Core Platform.
 *
 * @param filePaths - Changed files that Core Platform co-owns.
 * @returns A collapsible Markdown section.
 */
function renderCorePlatformCoOwnedFiles(filePaths: string[]): string {
  return `
<details><summary><h2>ℹ️ Files co-owned by Core Platform (expand for more)</h2></summary>

> [!NOTE]
> For convenience in maintaining this repo, the Core Platform team co-owns
> certain files across all packages, such as manifests and changelogs. **It is
> not required to seek approval from Core Platform to change these files. This
> section is purely informational.**

${renderFileList(filePaths)}</details>
`;
}

/**
 * Describe how many files there are, pluralizing "file" if necessary.
 *
 * @param filePaths - The files.
 * @returns A phrase such as "1 file" or "2 files".
 */
function describeNumberOfFiles(filePaths: string[]): string {
  return `${filePaths.length} ${filePaths.length === 1 ? 'file' : 'files'}`;
}

/**
 * Render file paths as a sorted Markdown list.
 *
 * @param filePaths - Repository-relative paths.
 * @returns The list, ending with a line break.
 */
function renderFileList(filePaths: string[]): string {
  return [...filePaths]
    .sort((first, second) => first.localeCompare(second))
    .map((filePath) => `- \`${filePath}\`\n`)
    .join('');
}
