import { parseChangelog } from '@metamask/auto-changelog';

/**
 * Asynchronously fetches the CHANGELOG.md file content from a specified GitHub repository and branch.
 * The function constructs a URL to access the raw content of the file using GitHub's raw content service.
 * It handles authorization using an optional GitHub token from environment variables.
 *
 * @param options - The options for fetching the CHANGELOG.md file.
 * @param options.repoUrl - The full name of the repository (e.g., "owner/repo").
 * @param options.changelogPath - The path to the CHANGELOG.md file.
 * @param options.branch - The branch from which to fetch the CHANGELOG.md file.
 * @returns A promise that resolves to the content of the CHANGELOG.md file as a string.
 * If the fetch operation fails, it logs an error and returns an empty string.
 */
async function fetchChangelogFromGitHub({
  repoUrl,
  changelogPath,
  branch,
}: {
  repoUrl: string;
  changelogPath: string;
  branch: string;
}): Promise<string> {
  const url = `https://raw.githubusercontent.com/${repoUrl}/${branch}/${changelogPath}`;
  // eslint-disable-next-line n/no-process-env
  const token = process.env.GITHUB_TOKEN ?? '';

  try {
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error(
      `❌ Error fetching CHANGELOG.md from ${branch} on ${repoUrl}:`,
      error,
    );
    throw error;
  }
}

/**
 * Displays the differences between two sets of changelog entries.
 * @param baseChanges - The content of the '[Unreleased]' section from the base branch's CHANGELOG.md.
 * @param featureChanges - The content of the '[Unreleased]' section from the feature branch's CHANGELOG.md.
 */
function displayDiff(baseChanges: string, featureChanges: string) {
  // Compute the line-by-line differences
  const differences = diffLines(baseChanges, featureChanges);

  const addedLines: string[] = [];
  const removedLines: string[] = [];

  // Collect added and removed lines into separate lists
  differences.forEach((part) => {
    if (part.added) {
      addedLines.push(part.value.trim()); // Trim to remove leading/trailing spaces
    } else if (part.removed) {
      removedLines.push(part.value.trim());
    }
  });

  // Print the diff summary
  console.log("🔍 Diff between base and feature '[Unreleased]' sections:");

  if (removedLines.length > 0) {
    console.log('❌ Removed:');
    removedLines.forEach((line) => console.log(`${line}`));
  } else {
    console.log('❌ No removed lines.');
  }

  if (addedLines.length > 0) {
    console.log('✅ Added:');
    addedLines.forEach((line) => console.log(`${line}`));
  } else {
    console.log('✅ No added lines.');
  }
}

/**
 * Validates that the CHANGELOG.md in a feature branch has been updated correctly by comparing it
 * against the CHANGELOG.md in the base branch.
 *
 * @param options - The options for the changelog check.
 * @param options.repoUrl - The GitHub repository from which to fetch the CHANGELOG.md file.
 * @param options.changelogPath - The path to the CHANGELOG.md file.
 * @param options.featureBranch - The feature branch that should contain the updated CHANGELOG.md.
 */
async function checkChangelog({
  repoUrl,
  changelogPath,
  featureBranch,
}: {
  repoUrl: string;
  changelogPath: string;
  featureBranch: string;
}) {
  console.log(
    `🔍 Fetching CHANGELOG.md from GitHub repository: ${repoUrl} ${changelogPath}`,
  );

  const changelogContent = await fetchChangelogFromGitHub({
    repoUrl,
    changelogPath,
    branch: featureBranch,
  });

  if (!changelogContent) {
    console.error('❌ CHANGELOG.md is missing in the feature branch.');
    throw new Error('❌ CHANGELOG.md is missing in the feature branch.');
  }

  const changelogUnreleasedChanges = parseChangelog({
    changelogContent,
    repoUrl,
  }).getReleaseChanges('Unreleased');

  if (Object.values(changelogUnreleasedChanges).length === 0) {
    console.log(
      "❌ No new entries detected under '## Unreleased'. Please update the changelog.",
    );
    throw new Error(
      "❌ No new entries detected under '## Unreleased'. Please update the changelog.",
    );
  }

  console.log('✅ CHANGELOG.md has been correctly updated.');
}

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error(
    '❌ Usage: ts-node src/check-changelog.ts <repo-url> <feature-branch> <changelog-path>',
  );
  throw new Error('❌ Missing required arguments.');
}

const [repoUrl, featureBranch, changelogPath] = args;

// Ensure all required arguments are provided
if (!repoUrl || !featureBranch || !changelogPath) {
  console.error(
    '❌ Usage: ts-node src/check-changelog.ts <repo-url> <feature-branch> <changelog-path>',
  );
  throw new Error('❌ Missing required arguments.');
}

// Run the validation
checkChangelog({
  repoUrl,
  changelogPath,
  featureBranch,
}).catch((error) => {
  console.error('❌ Unexpected error:', error);
  throw error;
});
