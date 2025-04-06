import { parseChangelog } from '@metamask/auto-changelog';
import execa from 'execa';
import fs from 'fs/promises';
import path from 'path';

type PackageJson = {
  workspaces: string[];
};

/**
 * Gets the workspace patterns from package.json
 *
 * @param repoPath - The path to the repository
 * @returns Array of workspace patterns
 */
async function getWorkspacePatterns(repoPath: string): Promise<string[]> {
  const packageJsonPath = path.join(repoPath, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content) as PackageJson;

  if (!Array.isArray(packageJson.workspaces)) {
    return [];
  }

  return packageJson.workspaces;
}

/**
 * This function gets the workspace base and package name from the file path
 *
 * @param filePath - The path to the file
 * @param workspacePatterns - The workspace patterns
 * @returns An object containing the base directory and package name, or null if no match is found
 */
function getPackageInfo(
  filePath: string,
  workspacePatterns: string[],
): { base: string; package: string } | null {
  for (const pattern of workspacePatterns) {
    // Extract the base directory (everything before the *)
    const wildcardIndex = pattern.indexOf('*');
    if (wildcardIndex === -1) {
      continue;
    }

    const baseDir = pattern.substring(0, wildcardIndex);

    if (filePath.startsWith(baseDir)) {
      // Extract the package name (everything between baseDir and the next slash)
      const remainingPath = filePath.substring(baseDir.length);
      const nextSlashIndex = remainingPath.indexOf('/');

      if (nextSlashIndex !== -1) {
        const packageName = remainingPath.substring(0, nextSlashIndex);
        return {
          base: baseDir,
          package: packageName,
        };
      }
    }
  }

  return null;
}

/**
 * Gets the list of changed files between the current branch and main.
 *
 * @param repoPath - The path to the repository
 * @param baseRef - The base reference to compare against
 * @returns Array of changed file paths
 */
async function getChangedFiles(
  repoPath: string,
  baseRef: string,
): Promise<string[]> {
  try {
    await execa('git', ['fetch', 'origin', baseRef], {
      cwd: repoPath,
    });

    const { stdout } = await execa(
      'git',
      ['diff', '--name-only', `origin/${baseRef}...HEAD`],
      {
        cwd: repoPath,
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
    const changelogContent = await fs.readFile(changelogPath, 'utf-8');

    if (!changelogContent) {
      throw new Error('CHANGELOG.md is empty or missing');
    }

    const changelogUnreleasedChanges = parseChangelog({
      changelogContent,
      repoUrl: '', // Not needed as we're only parsing unreleased changes
    }).getReleaseChanges('Unreleased');

    if (Object.values(changelogUnreleasedChanges).length === 0) {
      throw new Error(
        "❌ No new entries detected under '## Unreleased' section. Please update the changelog.",
      );
    }
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
 * @param workspacePatterns - The workspace patterns
 * @returns Array of changed package information
 */
async function getChangedPackages(
  files: string[],
  workspacePatterns: string[],
): Promise<
  {
    base: string;
    package: string;
  }[]
> {
  const changedPackages = new Map<string, { base: string; package: string }>();

  for (const file of files) {
    // Skip workflow files
    if (file.startsWith('.github/workflows/')) {
      continue;
    }

    const packageInfo = getPackageInfo(file, workspacePatterns);
    if (packageInfo) {
      // Skip test files, docs, and changelog files
      if (
        !file.match(/\.(test|spec)\./u) &&
        !file.includes('__tests__/') &&
        !file.includes('/docs/') &&
        !file.endsWith('CHANGELOG.md')
      ) {
        changedPackages.set(packageInfo.package, packageInfo);
      }
    }
  }

  return Array.from(changedPackages.values());
}

/**
 * Main function to run the changelog check.
 */
async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);

  const [repoPath, baseRef] = args;

  if (!repoPath || !baseRef) {
    console.error(
      '❌ Usage: ts-node src/check-changelog.ts <repo-path> <base-ref>',
    );
    throw new Error('❌ Missing required arguments.');
  }

  const fullRepoPath = path.resolve(process.cwd(), repoPath);

  // Verify the repo path exists
  try {
    await fs.access(fullRepoPath);
  } catch {
    throw new Error(`Repository path not found: ${fullRepoPath}`);
  }

  const workspacePatterns = await getWorkspacePatterns(fullRepoPath);

  if (workspacePatterns.length > 0) {
    console.log(
      'Running in monorepo mode - checking changelogs for changed packages...',
    );

    const changedFiles = await getChangedFiles(fullRepoPath, baseRef);
    if (!changedFiles.length) {
      console.log('No changed files found. Exiting successfully.');
      return;
    }

    const changedPackages = await getChangedPackages(
      changedFiles,
      workspacePatterns,
    );
    if (!changedPackages.length) {
      console.log(
        'No package code changes detected that would require changelog updates.',
      );
      return;
    }

    const checkResults = await Promise.all(
      changedPackages.map(async (pkgInfo) => {
        try {
          await checkChangelogFile(
            path.join(
              fullRepoPath,
              pkgInfo.base,
              pkgInfo.package,
              'CHANGELOG.md',
            ),
          );
          console.log(
            `✅ CHANGELOG.md for ${pkgInfo.package} has been correctly updated.`,
          );
          return { package: pkgInfo.package, success: true };
        } catch (error) {
          console.error(
            `❌ Changelog check failed for package ${pkgInfo.package}:`,
            error,
          );
          return { package: pkgInfo.package, success: false, error };
        }
      }),
    );

    const hasError = checkResults.some((result) => !result.success);

    if (hasError) {
      throw new Error('One or more changelog checks failed');
    }
  } else {
    console.log(
      'Running in single-repo mode - checking changelog for the entire repository...',
    );
    await checkChangelogFile(path.join(fullRepoPath, 'CHANGELOG.md'));
    console.log('✅ CHANGELOG.md has been correctly updated.');
  }
}

main().catch((error) => {
  throw error;
});
