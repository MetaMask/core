import { resolveChangelogConflicts } from './lib/changelog-conflicts.js';

// Run the script immediately.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 *
 * Automatically resolves Git merge conflicts in `packages/*\/CHANGELOG.md`
 * files by taking the union of entries added on each side of the conflict.
 * Files that can't be automatically merged are left with their conflict
 * markers intact, and cause the script to exit with a non-zero code.
 *
 * Usage: `tsx scripts/merge-changelog-conflicts.ts`
 */
export async function main(): Promise<void> {
  const { resolved, skipped } = await resolveChangelogConflicts();

  if (resolved.length === 0 && skipped.length === 0) {
    console.log('No conflicted CHANGELOG.md files found.');
    return;
  }

  for (const { path, mergedEntryCount } of resolved) {
    const entryWord = mergedEntryCount === 1 ? 'entry' : 'entries';
    console.log(`Resolved ${path} (merged ${mergedEntryCount} new ${entryWord}).`);
  }

  for (const { path, reason } of skipped) {
    console.warn(`Could not automatically resolve ${path}: ${reason}`);
  }

  if (resolved.length > 0) {
    console.log(
      '\nRun `yarn changelog:validate` to confirm the merged changelogs are still valid.',
    );
  }

  if (skipped.length > 0) {
    process.exitCode = 1;
  }
}
