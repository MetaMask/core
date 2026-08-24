import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./lib/changelog-conflicts.js', () => ({
  resolveChangelogConflicts: jest.fn(),
}));

const changelogConflicts = await import('./lib/changelog-conflicts.js');
const { main } = await import('./merge-changelog-conflicts.js');

describe('merge-changelog-conflicts', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    jest.spyOn(console, 'warn').mockReturnValue(undefined);
    jest.spyOn(console, 'error').mockReturnValue(undefined);
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
      .mocked(changelogConflicts.resolveChangelogConflicts)
      .mockResolvedValue({ resolved: [], skipped: [] });

    await main();

    expect(console.log).toHaveBeenCalledWith(
      'No CHANGELOG.md files with conflicts found.',
    );
    expect(process.exitCode).toBe(0);
  });

  it('logs each resolved file and exits cleanly', async () => {
    jest
      .mocked(changelogConflicts.resolveChangelogConflicts)
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
      .mocked(changelogConflicts.resolveChangelogConflicts)
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
