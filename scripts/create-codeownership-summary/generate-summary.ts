import { execa } from 'execa';
import ignore from 'ignore';

/**
 * Leaves room below GitHub's comment size limit for the workflow's comment
 * marker and truncation notices.
 */
const MAX_SUMMARY_LENGTH = 60_000;

/**
 * Where GitHub looks for a CODEOWNERS file, in the order it looks.
 */
const CODEOWNERS_PATHS = [
  '.github/CODEOWNERS',
  'CODEOWNERS',
  'docs/CODEOWNERS',
];

/**
 * A rule in a CODEOWNERS file.
 */
type CodeownersRule = {
  /**
   * The pattern that files must match for the rule to apply.
   */
  pattern: string;
  /**
   * The owners of matching files.
   */
  owners: string[];
  /**
   * Owners listed in an inline `# maintenance-owner:` comment. These help
   * maintain the matching files, but their approval isn't needed when the
   * files have other owners.
   */
  maintenanceOwners: string[];
};

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
   * Sorted, unique owners; any one can approve the file.
   */
  requiredOwners: string[];
  /**
   * Sorted, unique owners that also own the file but whose approval isn't
   * needed.
   */
  maintenanceOwners: string[];
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
 * Files that a maintenance owner co-owns.
 */
type MaintainedFileGroup = {
  /**
   * The maintenance owner.
   */
  maintenanceOwner: string;
  /**
   * Repository-relative paths of the changed files it co-owns.
   */
  filePaths: string[];
};

/**
 * Generate a Markdown summary of which codeowners own the files changed on a
 * branch. The summary is what the Post Codeownership Summary workflow posts on
 * pull requests.
 *
 * Ownership comes from the CODEOWNERS file at the base ref, as GitHub uses for
 * a pull request. Files are grouped by the exact set of owners whose approval
 * is needed. Some owners only help maintain certain files, such as Core
 * Platform with package changelogs and manifests in this repository, and are
 * marked as such in CODEOWNERS; their approval isn't needed when the files
 * have other owners, so the files they co-own are listed again in a separate,
 * informational section.
 *
 * @param options - The options.
 * @param options.repositoryDirectoryPath - A directory within the Git
 * repository to inspect.
 * @param options.baseRef - The branch being merged into.
 * @param options.headRef - The branch being merged.
 * @returns The summary, or an empty string if no changed files have owners.
 */
export async function generateCodeownershipSummary({
  repositoryDirectoryPath,
  baseRef,
  headRef,
}: {
  repositoryDirectoryPath: string;
  baseRef: string;
  headRef: string;
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
  const codeownershipGroups = groupFilesByOwners(matchedFiles);
  const maintainedFileGroups = groupFilesByMaintenanceOwners(matchedFiles);

  return codeownershipGroups.length > 0
    ? renderSummary({ codeownershipGroups, maintainedFileGroups })
    : '';
}

/**
 * Read the CODEOWNERS file at a ref, from the first place GitHub looks for it.
 *
 * @param options - The options.
 * @param options.repositoryDirectoryPath - A directory within the Git
 * repository to inspect.
 * @param options.ref - The ref to read the file at.
 * @returns The contents of the file.
 * @throws If there is no CODEOWNERS file at the ref.
 */
async function readCodeownersFile({
  repositoryDirectoryPath,
  ref,
}: {
  repositoryDirectoryPath: string;
  ref: string;
}): Promise<string> {
  for (const codeownersPath of CODEOWNERS_PATHS) {
    try {
      const { stdout } = await execa(
        'git',
        ['show', `${ref}:${codeownersPath}`],
        {
          cwd: repositoryDirectoryPath,
        },
      );
      return stdout;
    } catch {
      // Git fails if the file doesn't exist, so try the next location
    }
  }

  throw new Error(
    `Could not find a CODEOWNERS file at ${ref} (looked for ${CODEOWNERS_PATHS.slice(0, -1).join(', ')}, and ${CODEOWNERS_PATHS.at(-1)})`,
  );
}

/**
 * Parse the rules in a CODEOWNERS file.
 *
 * Each rule is a pattern followed by owners, optionally followed by an inline
 * comment. An inline comment of the form `# maintenance-owner: <owners>` marks
 * owners that only help maintain the matching files.
 *
 * @param content - The contents of the CODEOWNERS file.
 * @returns The rules, in the order they appear, with later rules winning.
 */
function parseCodeowners(content: string): CodeownersRule[] {
  return content.split('\n').flatMap((line) => {
    const [pattern, ...tokens] = line.trim().split(/\s+/u);
    if (pattern === undefined || pattern === '' || pattern.startsWith('#')) {
      return [];
    }

    const commentIndex = tokens.findIndex((token) => token.startsWith('#'));
    const owners = commentIndex === -1 ? tokens : tokens.slice(0, commentIndex);
    const comment =
      commentIndex === -1 ? '' : tokens.slice(commentIndex).join(' ');
    return [
      { pattern, owners, maintenanceOwners: parseMaintenanceOwners(comment) },
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
      ? [{ filePath, ...splitOwners(codeownerMatcher.codeownerRule) }]
      : [];
  });
}

/**
 * Separate a rule's owners into those whose approval is needed and those that
 * only help maintain the matching files.
 *
 * Maintenance owners are only set apart when the rule has other owners who can
 * approve changes; otherwise, their approval is needed after all.
 *
 * @param codeownerRule - The rule.
 * @returns The required and maintenance owners, each sorted and unique.
 */
function splitOwners(
  codeownerRule: CodeownersRule,
): Pick<MatchedFile, 'requiredOwners' | 'maintenanceOwners'> {
  const owners = [...new Set(codeownerRule.owners)].sort();
  const maintenanceOwners = owners.filter((owner) =>
    codeownerRule.maintenanceOwners.includes(owner),
  );
  const requiredOwners = owners.filter(
    (owner) => !maintenanceOwners.includes(owner),
  );

  if (requiredOwners.length === 0) {
    return { requiredOwners: owners, maintenanceOwners: [] };
  }
  return { requiredOwners, maintenanceOwners };
}

/**
 * Group changed files by the owners whose approval is needed for them.
 *
 * @param matchedFiles - Changed files and their owners.
 * @returns Groups of changed files ordered by their owners.
 */
function groupFilesByOwners(matchedFiles: MatchedFile[]): CodeownershipGroup[] {
  const groups = new Map<string, CodeownershipGroup>();
  for (const { filePath, requiredOwners } of matchedFiles) {
    if (requiredOwners.length === 0) {
      continue;
    }
    const key = JSON.stringify(requiredOwners);
    let group = groups.get(key);
    if (!group) {
      group = { owners: requiredOwners, filePaths: [] };
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
): MaintainedFileGroup[] {
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
    .map(([maintenanceOwner, filePaths]) => ({ maintenanceOwner, filePaths }));
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
 * PR. It has two parts: first a list of changed files for each set of owners
 * whose approval is required, then the files co-owned by each maintenance
 * owner, whose approval is not required.
 *
 * @param options - The options.
 * @param options.codeownershipGroups - Mutually exclusive ownership groups.
 * @param options.maintainedFileGroups - Changed files co-owned by each
 * maintenance owner.
 * @returns A Markdown summary short enough to post as a GitHub comment.
 */
function renderSummary({
  codeownershipGroups,
  maintainedFileGroups,
}: {
  codeownershipGroups: CodeownershipGroup[];
  maintainedFileGroups: MaintainedFileGroup[];
}): string {
  let summary = `## 🛑 Files requiring codeowner review

${renderApprovalInstructions(codeownershipGroups)}
`;
  const sections = [
    ...codeownershipGroups.map(renderCodeownershipGroup),
    ...maintainedFileGroups.map(renderMaintainedFileGroup),
  ];

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
 * Render the files co-owned by a maintenance owner, explaining that its
 * approval isn't needed for them.
 *
 * The owner is shown as code so that the comment doesn't mention, and notify,
 * a team whose review isn't needed.
 *
 * @param group - The maintenance owner and the files it co-owns.
 * @param group.maintenanceOwner - The maintenance owner.
 * @param group.filePaths - Repository-relative paths of the changed files it
 * co-owns.
 * @returns A collapsible Markdown section.
 */
function renderMaintainedFileGroup({
  maintenanceOwner,
  filePaths,
}: MaintainedFileGroup): string {
  return `
<details><summary><h2>ℹ️ Files co-owned by <code>${maintenanceOwner}</code> (expand for more)</h2></summary>

> [!NOTE]
> For convenience in maintaining this repo, \`${maintenanceOwner}\` co-owns
> the following files. **It is not required to seek approval from
> \`${maintenanceOwner}\` to change these files. This section is purely
> informational.**

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
