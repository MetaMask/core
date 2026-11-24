import { execa } from 'execa';
import ignore from 'ignore';

import type { CodeownersRule } from '../manage-codeowners/types.ts';

/**
 * Shown at the top of a summary whose file lists had to be shortened to fit
 * within a maximum length, telling readers how to see every file.
 */
const SHORTENED_SUMMARY_WARNING = `> [!WARNING]
> This PR seems large! Some changed files needed to be omitted to post the summary below. Run \`yarn create-codeownership-summary\` on this branch to see the full output.

`;

/**
 * A changed file and whose approval it needs, based on the last CODEOWNERS
 * rule that matches it, which GitHub uses.
 */
type MatchedFile = {
  /**
   * Repository-relative path of the changed file.
   */
  filePath: string;
  /**
   * Sorted, unique owners whose approval is needed; any one can approve the
   * file.
   */
  primaryOwners: string[];
  /**
   * Sorted, unique owners that also own the file but whose approval isn't
   * needed.
   */
  maintenanceOwners: string[];
};

/**
 * Files with the same set of eligible codeowners.
 */
type PrimaryOwnershipGroup = {
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
 * Files that a maintenance owner co-owns.
 */
type MaintenanceOwnershipGroup = {
  /**
   * The maintenance owner.
   */
  owner: string;
  /**
   * Repository-relative paths of the changed files it co-owns.
   */
  filePaths: string[];
};

/**
 * Generate a Markdown summary of which codeowners own the files changed on a
 * branch. The summary is what the "Post codeownership summary" workflow posts
 * on pull requests.
 *
 * Ownership comes from the `CODEOWNERS` file at the base ref, as GitHub uses for
 * a pull request. Some files (e.g. manifests, changelogs, etc.) are co-owned by
 * a specific team (in this repo, it's Core Platform), and these are listed in
 * their own section. These files are marked by a special `# maintenance-owner:
 * <team>` comment in `CODEOWNERS`.
 *
 * @param options - The options.
 * @param options.repositoryDirectoryPath - A directory within the Git
 * repository to inspect.
 * @param options.baseRef - The branch being merged into.
 * @param options.headRef - The branch being merged.
 * @param options.maxLength - If given, the file lists are shortened as needed
 * so that the summary is no longer than this, e.g. to fit in a GitHub comment.
 * @returns The summary, or an empty string if no changed files have owners.
 */
export async function generateCodeownershipSummary({
  repositoryDirectoryPath,
  baseRef,
  headRef,
  maxLength,
}: {
  repositoryDirectoryPath: string;
  baseRef: string;
  headRef: string;
  maxLength?: number;
}): Promise<string> {
  const codeownerRules = parseCodeowners(
    await readCodeownersFile({ repositoryDirectoryPath, ref: baseRef }),
  );
  const changedFilePaths = await listChangedFilePaths({
    repositoryDirectoryPath,
    baseRef,
    headRef,
  });
  const matchedFiles = matchFilesToCodeownerRules(
    changedFilePaths,
    codeownerRules,
  );
  const primaryOwnershipGroups = groupFilesByPrimaryOwners(matchedFiles);
  const maintenanceOwnershipGroups =
    groupFilesByMaintenanceOwners(matchedFiles);

  return primaryOwnershipGroups.length > 0
    ? renderSummary({
        primaryOwnershipGroups,
        maintenanceOwnershipGroups,
        maxLength,
      })
    : '';
}

/**
 * Read the `.github/CODEOWNERS` file at the given ref.
 *
 * GitHub also looks for `CODEOWNERS` in the repository root and in `docs/`,
 * but our repositories keep it in `.github/`.
 *
 * @param options - The options.
 * @param options.repositoryDirectoryPath - A directory within the Git
 * repository to inspect.
 * @param options.ref - The ref to read the file at.
 * @returns The contents of the file.
 * @throws If there is no `.github/CODEOWNERS` file at the ref.
 */
async function readCodeownersFile({
  repositoryDirectoryPath,
  ref,
}: {
  repositoryDirectoryPath: string;
  ref: string;
}): Promise<string> {
  const { stdout } = await execa('git', ['show', `${ref}:.github/CODEOWNERS`], {
    cwd: repositoryDirectoryPath,
  });
  return stdout;
}

/**
 * Parse the rules in a `CODEOWNERS` file.
 *
 * Each rule is a pattern followed by owners. A rule may end in an an inline
 * comment of the form `# maintenance-owner: <owners>`, which marks co-owners
 * that only help maintain the matching files (for this repo, it's Core
 * Platform). A rule is encapsulated in the same data structure we use elsewhere
 * for generating `CODEOWNERS`.
 *
 * @param content - The contents of the `CODEOWNERS` file.
 * @returns The rules, in the order they appear in `CODEOWNERS`.
 */
function parseCodeowners(content: string): CodeownersRule[] {
  return content.split('\n').flatMap((line) => {
    // Note: This means that a `#` in the middle of a word would start a comment.
    // This is strange, but matches what other projects like `hmarr/codeowners` do.
    const commentStartIndex = line.indexOf('#');
    const rule =
      commentStartIndex === -1 ? line : line.slice(0, commentStartIndex);
    const comment =
      commentStartIndex === -1 ? '' : line.slice(commentStartIndex);
    const [pattern, ...owners] = rule.trim().split(/\s+/u);
    if (pattern === undefined || pattern === '') {
      return [];
    }

    // Only owners on the rule itself own the matching files, so ignore any
    // others the comment lists
    const maintenanceOwners = parseMaintenanceOwners(comment).filter((owner) =>
      owners.includes(owner),
    );
    const primaryOwners = owners.filter(
      (owner) => !maintenanceOwners.includes(owner),
    );
    return [
      {
        pattern,
        primaryOwners,
        ...(maintenanceOwners.length > 0 ? { maintenanceOwners } : {}),
      },
    ];
  });
}

/**
 * Get the owners listed in a `# maintenance-owner:` comment.
 *
 * @param comment - An inline comment from a CODEOWNERS rule, such as
 * `# maintenance-owner: @MetaMask/core-platform`.
 * @returns The listed owners, or an empty array for any other comment.
 */
function parseMaintenanceOwners(comment: string): string[] {
  const match = /^#\s*maintenance-owner:\s*(.*)$/u.exec(comment);
  return (match?.[1] ?? '').split(/\s+/u).filter((owner) => owner !== '');
}

/**
 * List the files changed on the head ref since it diverged from the base ref.
 * In the context of the "Post codeownership summary" workflow, this effectively
 * lists the files changed on a PR branch.
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
      // Compute the merge base automatically, so we don't need to do it in the workflow.
      `${baseRef}...${headRef}`,
    ],
    { cwd: repositoryDirectoryPath, stripFinalNewline: false },
  );
  return stdout.split('\0').filter((filePath) => filePath !== '');
}

/**
 * Find the codeowner rule that determines the owners of each changed file,
 * and work out whose approval the file needs.
 *
 * @param changedFilePaths - Repository-relative paths of changed files.
 * @param codeownerRules - Ownership rules in precedence order.
 * @returns The changed files that match a rule, along with their owners.
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
      ? [{ filePath, ...resolveOwners(codeownerMatcher.codeownerRule) }]
      : [];
  });
}

/**
 * Work out whose approval is needed for the files that a rule matches.
 *
 * Maintenance owners are only set apart when the rule has primary owners who
 * can approve changes; otherwise, their approval is needed after all.
 *
 * @param codeownerRule - The rule.
 * @returns The primary and maintenance owners, each sorted and unique.
 */
function resolveOwners(
  codeownerRule: CodeownersRule,
): Pick<MatchedFile, 'primaryOwners' | 'maintenanceOwners'> {
  const primaryOwners = [...new Set(codeownerRule.primaryOwners)].sort();
  const maintenanceOwners = [
    ...new Set(codeownerRule.maintenanceOwners ?? []),
  ].sort();

  if (primaryOwners.length === 0) {
    return { primaryOwners: maintenanceOwners, maintenanceOwners: [] };
  }
  return { primaryOwners, maintenanceOwners };
}

/**
 * Group changed files by the primary owners whose approval is needed for them.
 *
 * @param matchedFiles - Changed files and their owners.
 * @returns Groups of changed files ordered by their owners.
 */
function groupFilesByPrimaryOwners(
  matchedFiles: MatchedFile[],
): PrimaryOwnershipGroup[] {
  const groups = new Map<string, PrimaryOwnershipGroup>();
  for (const { filePath, primaryOwners } of matchedFiles) {
    if (primaryOwners.length === 0) {
      continue;
    }
    const key = JSON.stringify(primaryOwners);
    let group = groups.get(key);
    if (!group) {
      group = { owners: primaryOwners, filePaths: [] };
      groups.set(key, group);
    }
    group.filePaths.push(filePath);
  }

  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, group]) => group);
}

/**
 * Group changed files by the maintenance owners that co-own them.
 *
 * @param matchedFiles - Changed files and their owners.
 * @returns Groups of changed files ordered by maintenance owner.
 */
function groupFilesByMaintenanceOwners(
  matchedFiles: MatchedFile[],
): MaintenanceOwnershipGroup[] {
  const filePathsByMaintenanceOwner = new Map<string, string[]>();
  for (const { filePath, maintenanceOwners } of matchedFiles) {
    for (const maintenanceOwner of maintenanceOwners) {
      const filePaths = filePathsByMaintenanceOwner.get(maintenanceOwner) ?? [];
      filePaths.push(filePath);
      filePathsByMaintenanceOwner.set(maintenanceOwner, filePaths);
    }
  }

  return [...filePathsByMaintenanceOwner.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([owner, filePaths]) => ({ owner, filePaths }));
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
 * Build the Markdown-formatted string that will be used to post a comment on a
 * PR. It has two parts: first a list of changed files for each set of owners
 * whose approval is required, then the files co-owned by each maintenance
 * owner, whose approval is not required.
 *
 * @param options - The options.
 * @param options.primaryOwnershipGroups - Changed files grouped by the owners
 * whose approval is required.
 * @param options.maintenanceOwnershipGroups - Changed files co-owned by each
 * maintenance owner.
 * @param options.maxLength - If given, the most characters the summary may
 * have. If every file doesn't fit, each file list is shortened to the same
 * number of files, the most that fit, and a warning at the top explains how to
 * see every file.
 * @returns The Markdown summary.
 */
function renderSummary({
  primaryOwnershipGroups,
  maintenanceOwnershipGroups,
  maxLength,
}: {
  primaryOwnershipGroups: PrimaryOwnershipGroup[];
  maintenanceOwnershipGroups: MaintenanceOwnershipGroup[];
  maxLength: number | undefined;
}): string {
  /**
   * Render the summary, showing at most the given number of files in each
   * list.
   *
   * @param maxFilesPerList - The most files to show in each list.
   * @returns The Markdown summary.
   */
  function renderSummaryWithMaxFilesPerList(maxFilesPerList: number): string {
    return [
      renderApprovalRequiredSection({
        primaryOwnershipGroups,
        maxFilesPerList,
      }),
      ...maintenanceOwnershipGroups.map((maintenanceOwnershipGroup) =>
        renderApprovalOptionalSection({
          maintenanceOwnershipGroup,
          maxFilesPerList,
        }),
      ),
    ].join('');
  }

  // First try rendering the summary without any file list limits.
  const fullSummary = renderSummaryWithMaxFilesPerList(Infinity);
  if (maxLength === undefined || fullSummary.length <= maxLength) {
    return fullSummary;
  }

  // Too long! We need to elide each file list.
  const maxFilesPerList = findMostFilesPerListThatFit({
    renderSummaryWithMaxFilesPerList,
    initialMaxListLength: Math.max(
      ...[...primaryOwnershipGroups, ...maintenanceOwnershipGroups].map(
        ({ filePaths }) => filePaths.length,
      ),
    ),
    maxTotalLength: maxLength - SHORTENED_SUMMARY_WARNING.length,
  });
  return (
    SHORTENED_SUMMARY_WARNING +
    renderSummaryWithMaxFilesPerList(maxFilesPerList)
  );
}

/**
 * Find the most files that each list in the summary can show while keeping the
 * entire summary within a maximum length.
 *
 * @param options - The options.
 * @param options.renderSummaryWithMaxFilesPerList - Render the summary, showing
 * at most the given number of files in each list.
 * @param options.initialMaxListLength - The number of files in the longest list.
 * @param options.maxTotalLength - The most characters the summary may have.
 * @returns The number of files to show in each list, or 0 if even that
 * doesn't fit.
 */
function findMostFilesPerListThatFit({
  renderSummaryWithMaxFilesPerList,
  initialMaxListLength,
  maxTotalLength,
}: {
  renderSummaryWithMaxFilesPerList: (maxFilesPerList: number) => string;
  initialMaxListLength: number;
  maxTotalLength: number;
}): number {
  // We could test the length of the summary starting at some reasonable maximum
  // and work backward, but that would be suboptimal if a list has hundreds of
  // files, so we work out the perfect length via binary search.
  let start = 0;
  let end = initialMaxListLength - 1;
  while (start < end) {
    const middle = Math.ceil((start + end) / 2);
    if (renderSummaryWithMaxFilesPerList(middle).length <= maxTotalLength) {
      start = middle;
    } else {
      end = middle - 1;
    }
  }
  return start;
}

/**
 * Render the files whose owners must approve the PR, grouped by those owners.
 * Each group is collapsed, showing its owners and how many files it has.
 *
 * @param options - The options.
 * @param options.primaryOwnershipGroups - Changed files grouped by the owners
 * whose approval is required.
 * @param options.maxFilesPerList - The most files to list for each group.
 * @returns A Markdown section.
 */
function renderApprovalRequiredSection({
  primaryOwnershipGroups,
  maxFilesPerList,
}: {
  primaryOwnershipGroups: PrimaryOwnershipGroup[];
  maxFilesPerList: number;
}): string {
  const hasGroupWithMultipleOwners = primaryOwnershipGroups.some(
    ({ owners }) => owners.length > 1,
  );
  const instructions = hasGroupWithMultipleOwners
    ? `To merge this PR, you'll need to get approvals from the following owner groups.
**For files with multiple owners, approval from one owner is sufficient.**`
    : "To merge this PR, you'll need to get approvals from the following owners.";
  const groups = primaryOwnershipGroups.map(({ owners, filePaths }) => {
    const ownerList = owners
      .map((owner) => `<strong>${owner}</strong>`)
      .join(' <em>or</em> ');
    return `
<details>
<summary>${ownerList} (${describeNumberOfFiles(filePaths.length)})</summary>

${renderFileList(filePaths, maxFilesPerList)}</details>
`;
  });

  return `## 🛑 Files requiring codeowner review

${instructions}
${groups.join('')}`;
}

/**
 * Render the files co-owned by a maintenance owner, explaining that its
 * approval isn't needed for them.
 *
 * The owner is shown as code so that the comment doesn't mention, and notify,
 * a team whose review isn't needed.
 *
 * @param options - The options.
 * @param options.maintenanceOwnershipGroup - The maintenance ownership group.
 * @param options.maxFilesPerList - The most files to list.
 * @returns A collapsible Markdown section.
 */
function renderApprovalOptionalSection({
  maintenanceOwnershipGroup,
  maxFilesPerList,
}: {
  maintenanceOwnershipGroup: MaintenanceOwnershipGroup;
  maxFilesPerList: number;
}): string {
  return `
<details><summary><h2>ℹ️ Files co-owned by <code>${maintenanceOwnershipGroup.owner}</code> (expand for more)</h2></summary>

> [!NOTE]
> For convenience in maintaining this repo, \`${maintenanceOwnershipGroup.owner}\` co-owns
> the following files. **It is not required to seek approval from
> \`${maintenanceOwnershipGroup.owner}\` to change these files. This section is purely
> informational.**

${renderFileList(maintenanceOwnershipGroup.filePaths, maxFilesPerList)}</details>
`;
}

/**
 * Describe how many files there are, pluralizing "file" if necessary.
 *
 * @param numberOfFiles - The number of files.
 * @returns A phrase such as "1 file" or "2 files".
 */
function describeNumberOfFiles(numberOfFiles: number): string {
  return `${numberOfFiles} ${numberOfFiles === 1 ? 'file' : 'files'}`;
}

/**
 * Render file paths as a sorted Markdown list. If there are too many to show,
 * the list ends with a note of how many were left out.
 *
 * @param filePaths - Repository-relative paths.
 * @param maxFiles - The most files to list.
 * @returns The list, ending with a line break.
 */
function renderFileList(filePaths: string[], maxFiles: number): string {
  const listedFilePaths = [...filePaths]
    .sort((first, second) => first.localeCompare(second))
    .slice(0, maxFiles);
  const list = listedFilePaths
    .map((filePath) => `- \`${filePath}\`\n`)
    .join('');
  if (listedFilePaths.length === filePaths.length) {
    return list;
  }

  const numberOfOmittedFiles = filePaths.length - listedFilePaths.length;
  const omittedFiles = `${numberOfOmittedFiles} more ${numberOfOmittedFiles === 1 ? 'file' : 'files'}`;
  return `${list}- ... _(${omittedFiles})_ ...\n`;
}
