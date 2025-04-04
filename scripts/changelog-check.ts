import { parseChangelog } from '@metamask/auto-changelog';
import execa from 'execa';
import fs from 'fs/promises';

/**
 * Gets the list of changed files between the current branch and main.
 *
 * @param targetRepoPath - The path to the target repository
 * @param baseRef - The base reference to compare against
 * @returns Array of changed file paths
 */
async function getChangedFiles(
  targetRepoPath: string,
  baseRef: string,
): Promise<string[]> {
  if (!targetRepoPath) {
    throw new Error('TARGET_REPO_PATH environment variable must be set');
  }

  try {
    const { stdout } = await execa(
      'git',
      ['diff', '--name-only', `${baseRef}...HEAD`],
      {
        cwd: targetRepoPath,
      },
    );

    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Failed to get changed files:', error);
    throw error;
  }
}

/**
 * Reads and validates a changelog file.
 *
 * @param changelogPath - The path to the changelog file to check
 */
async function checkChangelogFile(changelogPath: string): Promise<void> {
  try {
    console.log(`🔍 Reading changelog file: ${changelogPath}`);
    const changelogContent = await fs.readFile(changelogPath, 'utf-8');

    if (!changelogContent) {
      throw new Error('CHANGELOG.md is empty or missing');
    }

    const changelogUnreleasedChanges = parseChangelog({
      changelogContent,
      repoUrl: '', // Not needed when reading local files
    }).getReleaseChanges('Unreleased');

    if (Object.values(changelogUnreleasedChanges).length === 0) {
      throw new Error(
        "❌ No new entries detected under '## Unreleased'. Please update the changelog.",
      );
    }

    console.log('✅ CHANGELOG.md has been correctly updated.');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`❌ CHANGELOG.md not found at ${changelogPath}`);
    }
    throw error;
  }
}

/**
 * Gets the list of changed packages from the changed files.
 *
 * @param files - The list of changed files
 * @returns Array of changed package names
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
 * Main function to run the changelog check.
 */
async function main() {
  // eslint-disable-next-line n/no-process-env
  const { IS_MONOREPO, TARGET_REPO_PATH, BASE_REF = 'main' } = process.env;

  if (!TARGET_REPO_PATH) {
    throw new Error('TARGET_REPO_PATH environment variable must be set');
  }

  // Verify the target repo path exists
  try {
    await fs.access(TARGET_REPO_PATH);
  } catch {
    throw new Error(`Target repository path not found: ${TARGET_REPO_PATH}`);
  }

  if (IS_MONOREPO === 'true') {
    console.log(
      'Running in monorepo mode - checking changelogs for changed packages...',
    );

    const changedFiles = await getChangedFiles(TARGET_REPO_PATH, BASE_REF);
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
    for (const pkg of changedPackages) {
      try {
        await checkChangelogFile(
          `${TARGET_REPO_PATH}/packages/${pkg}/CHANGELOG.md`,
        );
      } catch (error) {
        console.error(`❌ Changelog check failed for package ${pkg}:`, error);
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
    await checkChangelogFile(`${TARGET_REPO_PATH}/CHANGELOG.md`);
  }
}

main().catch((error) => {
  throw error;
});
