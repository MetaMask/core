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
  try {
    const url = `https://raw.githubusercontent.com/${repoUrl}/${branch}/${changelogPath}`;
    // eslint-disable-next-line n/no-process-env
    const token = process.env.GITHUB_TOKEN ?? '';
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- This script only runs in CI with Node.js >=18
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
    throw new Error('❌ CHANGELOG.md is missing in the feature branch.');
  }

  const changelogUnreleasedChanges = parseChangelog({
    changelogContent,
    repoUrl,
  }).getReleaseChanges('Unreleased');

  if (Object.values(changelogUnreleasedChanges).length === 0) {
    throw new Error(
      "❌ No new entries detected under '## Unreleased'. Please update the changelog.",
    );
  }

  console.log('✅ CHANGELOG.md has been correctly updated.');
}

type ChangedFile = {
  filename: string;
};

/**
 * Asynchronously fetches the list of changed files from a specified GitHub pull request.
 *
 * @returns A promise that resolves to an array of changed file paths.
 */
async function fetchChangedFiles(): Promise<string[]> {
  // eslint-disable-next-line n/no-process-env
  const { GITHUB_TOKEN, GITHUB_REPO, PR_NUMBER } = process.env;
  const files: string[] = [];
  let page = 1;

  while (true) {
    const headers: HeadersInit = GITHUB_TOKEN
      ? { Authorization: `Bearer ${GITHUB_TOKEN}` }
      : {};
    const url = `https://api.github.com/repos/${GITHUB_REPO}/pulls/${PR_NUMBER}/files?page=${page}&per_page=100`;

    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- This script only runs in CI with Node.js >=18
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch changed files: ${response.statusText}`);
    }

    const data = (await response.json()) as ChangedFile[];

    if (!data.length) {
      break;
    }

    files.push(...data.map((file) => file.filename));

    if (data.length < 100) {
      break;
    }

    page += 1;
  }

  return files;
}

/**
 * Extracts the changed packages from a list of changed files.
 *
 * @param files - An array of changed file paths.
 * @returns An array of changed package names.
 */
function getChangedPackages(files: string[]): string[] {
  const changedPackages = new Set<string>();

  for (const file of files) {
    // Skip workflow files
    if (file.startsWith('.github/workflows/')) {
      continue;
    }

    const match = file.match(/^packages\/([^/]+)\//u);
    if (match) {
      const package_ = match[1];

      // Skip test files, docs, and changelog files
      if (
        !file.match(/\.(test|spec)\./u) &&
        !file.includes('__tests__/') &&
        !file.startsWith(`packages/${package_}/docs/`) &&
        !file.endsWith('CHANGELOG.md')
      ) {
        changedPackages.add(package_);
      }
    }
  }

  return Array.from(changedPackages);
}

/**
 * Main function that orchestrates the changelog check process.
 *
 * @throws {Error} If required environment variables are not set or if an error occurs during the process.
 */
async function main() {
  // eslint-disable-next-line n/no-process-env
  const { IS_MONOREPO, GITHUB_REPO, HEAD_REF } = process.env;

  if (!GITHUB_REPO || !HEAD_REF) {
    throw new Error(
      'Required environment variables GITHUB_REPO and HEAD_REF must be set',
    );
  }

  if (IS_MONOREPO === 'true') {
    console.log(
      'Running in monorepo mode - checking changelogs for changed packages...',
    );

    const changedFiles = await fetchChangedFiles();
    if (!changedFiles.length) {
      console.log('No changed files found. Exiting successfully.');
      return;
    }

    const changedPackages = getChangedPackages(changedFiles);
    if (!changedPackages.length) {
      console.log(
        'No package code changes detected that would require changelog updates.',
      );
      return;
    }

    let hasError = false;
    for (const package_ of changedPackages) {
      try {
        await checkChangelog({
          repoUrl: GITHUB_REPO,
          changelogPath: `packages/${package_}/CHANGELOG.md`,
          featureBranch: HEAD_REF,
        });
      } catch (error) {
        console.error(
          `❌ Changelog check failed for package ${package_}:`,
          error,
        );
        hasError = true;
      }
    }

    if (hasError) {
      throw new Error('One or more changelog checks failed');
    }
  } else {
    console.log(
      'Running in single-repo mode - checking changelog for the entire repository...',
    );
    await checkChangelog({
      repoUrl: GITHUB_REPO,
      changelogPath: 'CHANGELOG.md',
      featureBranch: HEAD_REF,
    });
  }
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
