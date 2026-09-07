import * as changelogConflicts from './lib/changelog-conflicts.js';
import { main } from './merge-changelog-conflicts.js';

jest.mock('./lib/changelog-conflicts');

describe('merge-changelog-conflicts', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    // The module under test invokes `main()` once as a side effect of being
    // imported (using the auto-mocked, undefined-returning
    // `resolveChangelogConflicts`), which leaves a stale exit code.
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = 0;
  });

  it('logs a message and exits cleanly when there are no conflicted files', async () => {
    jest
      .spyOn(changelogConflicts, 'resolveChangelogConflicts')
      .mockResolvedValue({ resolved: [], skipped: [] });

    await main();

    expect(console.log).toHaveBeenCalledWith(
      'No CHANGELOG.md files with conflicts found.',
    );
    expect(process.exitCode).toBe(0);
  });

  it('logs each resolved file and exits cleanly', async () => {
    jest
      .spyOn(changelogConflicts, 'resolveChangelogConflicts')
      .mockResolvedValue({
        resolved: [
          { path: 'packages/example/CHANGELOG.md', mergedEntryCount: 2 },
        ],
        skipped: [],
      });

    await main();

    expect(console.log).toHaveBeenCalledWith(
      'Resolved packages/example/CHANGELOG.md (merged 2 new entries).',
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('yarn changelog:validate'),
    );
    expect(process.exitCode).toBe(0);
  });

  it('warns about skipped files and exits with a non-zero code', async () => {
    jest
      .spyOn(changelogConflicts, 'resolveChangelogConflicts')
      .mockResolvedValue({
        resolved: [],
        skipped: [
          {
            path: 'packages/example/CHANGELOG.md',
            reason: 'Malformed release header',
          },
        ],
      });

    await main();

    expect(console.warn).toHaveBeenCalledWith(
      'Could not automatically resolve packages/example/CHANGELOG.md: Malformed release header',
    );
    expect(process.exitCode).toBe(1);
  });
});
