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
    throw new Error('Workspaces must be an array of strings');
  }

  return packageJson.workspaces;
}

/**
 * Gets the package name from a file path based on workspace patterns
 *
 * @param filePath - The path to the file
 * @param workspacePatterns - The workspace patterns
 * @returns The package name or null if no match is found
 */
function getPackageFromPath(
  filePath: string,
  workspacePatterns: string[],
): string | null {
  // Convert glob patterns to regex patterns
  const regexPatterns = workspacePatterns.map((pattern) => {
    return new RegExp(`^${pattern.replace(/\*/gu, '([^/]+)')}$`, 'u');
  });

  // Try each pattern until we find a match
  for (const regex of regexPatterns) {
    const match = filePath.match(regex);
    if (match) {
      return match[1]; // Return the captured package name
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
    // First fetch the base branch
    await execa('git', ['fetch', 'origin', baseRef], {
      cwd: repoPath,
    });

    // Then get the diff between base and current HEAD
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
 * @param workspacePatterns - The workspace patterns
 * @returns Array of changed package names
 */
async function getChangedPackages(
  files: string[],
  workspacePatterns: string[],
): Promise<string[]> {
  const changedPackages = new Set<string>();

  for (const file of files) {
    // Skip workflow files
    if (file.startsWith('.github/workflows/')) {
      continue;
    }

    const pkg = getPackageFromPath(file, workspacePatterns);
    if (pkg) {
      // Skip test files, docs, and changelog files
      if (
        !file.match(/\.(test|spec)\./u) &&
        !file.includes('__tests__/') &&
        !file.includes('/docs/') &&
        !file.endsWith('CHANGELOG.md')
      ) {
        changedPackages.add(pkg);
      }
    }
  }

  return Array.from(changedPackages);
}

/**
 * Main function to run the changelog check.
 */
async function main() {
  const {
    BASE_REF: baseRef = 'main',
    IS_MONOREPO: isMonorepo,
    REPO_PATH,
    // eslint-disable-next-line n/no-process-env
  } = process.env;

  if (!REPO_PATH) {
    throw new Error('REPO_PATH environment variable must be set');
  }

  const repoPath = path.resolve(process.cwd(), REPO_PATH);

  // Verify the repo path exists
  try {
    await fs.access(repoPath);
  } catch {
    throw new Error(`Repository path not found: ${repoPath}`);
  }

  if (isMonorepo === 'true') {
    console.log(
      'Running in monorepo mode - checking changelogs for changed packages...',
    );

    const changedFiles = await getChangedFiles(repoPath, baseRef);
    if (!changedFiles.length) {
      console.log('No changed files found. Exiting successfully.');
      return;
    }

    const workspacePatterns = await getWorkspacePatterns(repoPath);

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

    let hasError = false;

    for (const pkg of changedPackages) {
      try {
        // Find the matching workspace pattern for this package
        const pattern = workspacePatterns.find((p) =>
          new RegExp(`^${p.replace(/\*/gu, '[^/]+')}$`, 'u').test(`${pkg}`),
        );
        if (!pattern) {
          throw new Error(
            `Could not find workspace pattern for package ${pkg}`,
          );
        }

        const packageBase = pattern.replace('/*', '');
        await checkChangelogFile(
          path.join(repoPath, packageBase, pkg, 'CHANGELOG.md'),
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
    await checkChangelogFile(`${repoPath}/CHANGELOG.md`);
  }
}

main().catch((error) => {
  throw error;
});
