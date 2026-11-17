import { writeFile } from '@metamask/node-utils';
import { execa } from 'execa';
import * as path from 'node:path';

/**
 * Create an empty Git repository on `main` that is unaffected by the user's
 * Git configuration.
 *
 * @param directoryPath - Where to create the repository.
 */
export async function initializeRepository(
  directoryPath: string,
): Promise<void> {
  await execa('git', ['init', '--quiet', '--initial-branch=main'], {
    cwd: directoryPath,
  });
  await execa('git', ['config', 'user.name', 'Test'], { cwd: directoryPath });
  await execa('git', ['config', 'user.email', 'test@example.com'], {
    cwd: directoryPath,
  });
  await execa('git', ['config', 'commit.gpgsign', 'false'], {
    cwd: directoryPath,
  });
  await execa('git', ['config', 'core.hooksPath', '/dev/null'], {
    cwd: directoryPath,
  });
}

/**
 * Create and switch to a branch.
 *
 * @param directoryPath - The repository.
 * @param branchName - The branch to create.
 */
export async function createBranch(
  directoryPath: string,
  branchName: string,
): Promise<void> {
  await execa('git', ['checkout', '--quiet', '-b', branchName], {
    cwd: directoryPath,
  });
}

/**
 * Write files and commit them.
 *
 * @param directoryPath - The repository.
 * @param files - File contents keyed by repository-relative path.
 */
export async function commitFiles(
  directoryPath: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    await writeFile(path.join(directoryPath, filePath), content);
  }
  await execa('git', ['add', '--all'], { cwd: directoryPath });
  await commitStagedChanges(directoryPath);
}

/**
 * Commit whatever is staged.
 *
 * @param directoryPath - The repository.
 */
async function commitStagedChanges(directoryPath: string): Promise<void> {
  await execa('git', ['commit', '--quiet', '-m', 'Change'], {
    cwd: directoryPath,
  });
}
