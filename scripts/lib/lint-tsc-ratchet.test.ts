import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

jest.unstable_mockModule('./tsc-suppressions.js', () => ({
  findAddedSuppressions: jest.fn(),
  printAddedSuppressions: jest.fn(),
  readSuppressions: jest.fn(),
}));

const { execa } = await import('execa');
const tscSuppressions = await import('./tsc-suppressions.js');
const { lintTscRatchet } = await import('./lint-tsc-ratchet.js');

const BASE = { 'a.ts': { TS2322: { count: 2 } } };
const CURRENT = { 'a.ts': { TS2322: { count: 1 } } };

const ADDITION = {
  filePath: 'a.ts',
  code: 'TS2322',
  count: 3,
  baseCount: 2,
};

/**
 * Stubs the Git commands that the script runs.
 *
 * @param args - The arguments to this function.
 * @param args.mergeBase - The commit that `git merge-base` should report, or
 * null if it should fail.
 * @param args.fileContents - The suppressions file that `git show` should
 * produce, or null if it should fail.
 * @param args.refExists - Whether `git rev-parse` should resolve the ref.
 */
function mockGit({
  mergeBase = 'abc123',
  fileContents = JSON.stringify(BASE),
  refExists = true,
}: {
  mergeBase?: string | null;
  fileContents?: string | null;
  refExists?: boolean;
} = {}): void {
  jest.mocked(execa).mockImplementation((async (
    _file: string,
    args: string[],
  ) => {
    const succeed = (stdout: string): { stdout: string; exitCode: number } => ({
      stdout,
      exitCode: 0,
    });
    const fail = { stdout: '', exitCode: 1 };

    if (args[0] === 'merge-base') {
      return mergeBase === null ? fail : succeed(`${mergeBase}\n`);
    }
    if (args[0] === 'rev-parse') {
      return refExists ? succeed('abc123') : fail;
    }
    return fileContents === null ? fail : succeed(fileContents);
  }) as never);
}

describe('lintTscRatchet', () => {
  let originalProcess: typeof globalThis.process;

  beforeEach(() => {
    originalProcess = globalThis.process;
    // The exit code is reset because it is global state that another test file
    // may have set.
    globalThis.process = { ...globalThis.process, exitCode: undefined };
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    jest.mocked(tscSuppressions.readSuppressions).mockResolvedValue(CURRENT);
    jest.mocked(tscSuppressions.findAddedSuppressions).mockReturnValue([]);
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('compares the current suppressions against the merge base', async () => {
    mockGit({ mergeBase: 'abc123' });

    await lintTscRatchet([]);

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['merge-base', 'HEAD', 'origin/main'],
      expect.objectContaining({ reject: false }),
    );
    expect(execa).toHaveBeenCalledWith(
      'git',
      ['show', 'abc123:tsc-suppressions.json'],
      expect.objectContaining({ reject: false }),
    );
    expect(tscSuppressions.findAddedSuppressions).toHaveBeenCalledWith({
      current: CURRENT,
      base: BASE,
    });
  });

  it('compares against the given base branch when one is passed', async () => {
    mockGit();

    await lintTscRatchet(['--base', 'origin/some-branch']);

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['merge-base', 'HEAD', 'origin/some-branch'],
      expect.objectContaining({ reject: false }),
    );
  });

  it('falls back to the base ref when the merge base cannot be determined', async () => {
    mockGit({ mergeBase: null });

    await lintTscRatchet([]);

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['show', 'origin/main:tsc-suppressions.json'],
      expect.objectContaining({ reject: false }),
    );
  });

  it('leaves the exit code alone when nothing has been added', async () => {
    mockGit();
    jest.mocked(tscSuppressions.findAddedSuppressions).mockReturnValue([]);

    await lintTscRatchet([]);

    expect(tscSuppressions.printAddedSuppressions).toHaveBeenCalledWith([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('exits with a non-zero code when suppressions have been added', async () => {
    mockGit();
    jest
      .mocked(tscSuppressions.findAddedSuppressions)
      .mockReturnValue([ADDITION]);

    await lintTscRatchet([]);

    expect(tscSuppressions.printAddedSuppressions).toHaveBeenCalledWith([
      ADDITION,
    ]);
    expect(process.exitCode).toBe(1);
  });

  it('throws when the ref to compare against cannot be resolved', async () => {
    mockGit({ mergeBase: null, refExists: false });

    await expect(lintTscRatchet([])).rejects.toThrow(
      'Cannot resolve origin/main. Fetch the base branch and try again.',
    );
    expect(tscSuppressions.findAddedSuppressions).not.toHaveBeenCalled();
  });

  it('skips the check when the base has no suppressions file to compare against', async () => {
    mockGit({ fileContents: null });

    await lintTscRatchet([]);

    expect(tscSuppressions.findAddedSuppressions).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
