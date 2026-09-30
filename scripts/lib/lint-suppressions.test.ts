import { jest } from '@jest/globals';

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

jest.unstable_mockModule('./tsc-suppressions.ts', () => ({
  SUPPRESSIONS_FILE_NAME: 'tsc-suppressions.json',
  readSuppressions: jest.fn(),
}));

const { execa } = await import('execa');
const tscSuppressions = await import('./tsc-suppressions.ts');
const { findAddedSuppressions, printAddedSuppressions, lintSuppressions } =
  await import('./lint-suppressions.ts');

describe('findAddedSuppressions', () => {
  it('flags a file that the baseline does not suppress at all', () => {
    expect(
      findAddedSuppressions({
        current: { 'a.ts': { 'no-shadow': { count: 1 } } },
        base: {},
      }),
    ).toStrictEqual([
      { filePath: 'a.ts', rule: 'no-shadow', count: 1, baseCount: 0 },
    ]);
  });

  it('flags a rule that the baseline does not suppress within a file it does', () => {
    expect(
      findAddedSuppressions({
        current: {
          'a.ts': { 'no-shadow': { count: 1 }, 'id-length': { count: 1 } },
        },
        base: { 'a.ts': { 'no-shadow': { count: 1 } } },
      }),
    ).toStrictEqual([
      { filePath: 'a.ts', rule: 'id-length', count: 1, baseCount: 0 },
    ]);
  });

  it('flags a count that has grown', () => {
    expect(
      findAddedSuppressions({
        current: { 'a.ts': { TS2322: { count: 3 } } },
        base: { 'a.ts': { TS2322: { count: 2 } } },
      }),
    ).toStrictEqual([
      { filePath: 'a.ts', rule: 'TS2322', count: 3, baseCount: 2 },
    ]);
  });

  it('allows a count that is unchanged', () => {
    expect(
      findAddedSuppressions({
        current: { 'a.ts': { TS2322: { count: 2 } } },
        base: { 'a.ts': { TS2322: { count: 2 } } },
      }),
    ).toStrictEqual([]);
  });

  it('allows a count that has shrunk', () => {
    expect(
      findAddedSuppressions({
        current: { 'a.ts': { TS2322: { count: 1 } } },
        base: { 'a.ts': { TS2322: { count: 5 } } },
      }),
    ).toStrictEqual([]);
  });

  it('allows a rule or a file to disappear entirely', () => {
    expect(
      findAddedSuppressions({
        current: {},
        base: { 'a.ts': { TS2322: { count: 5 }, TS7005: { count: 1 } } },
      }),
    ).toStrictEqual([]);
  });

  it('reports every addition, not just the first', () => {
    expect(
      findAddedSuppressions({
        current: {
          'a.ts': { TS2322: { count: 1 } },
          'b.ts': { TS7005: { count: 2 } },
        },
        base: {},
      }),
    ).toHaveLength(2);
  });
});

describe('printAddedSuppressions', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  it('announces success when nothing was added, naming the file', () => {
    printAddedSuppressions('oxlint-suppressions.json', []);

    expect(console.log).toHaveBeenCalledWith(
      '✅ Nothing has been added to oxlint-suppressions.json. Good job!',
    );
  });

  it('prints each addition and how to resolve it', () => {
    printAddedSuppressions('oxlint-suppressions.json', [
      { filePath: 'a.ts', rule: 'no-shadow', count: 3, baseCount: 2 },
    ]);

    const output = jest.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('oxlint-suppressions.json');
    expect(output).toContain('a.ts');
    expect(output).toContain('no-shadow');
    expect(output).toContain('3');
    expect(output).toContain('2');
  });
});

/**
 * Stubs the Git commands the check runs.
 *
 * @param suppressions - The baseline the commands should produce.
 */
function mockGit(suppressions = '{}'): void {
  jest.mocked(execa).mockImplementation((async (
    _file: string,
    args: string[],
  ) => {
    if (args[0] === 'merge-base') {
      return { stdout: 'abc123\n' };
    }
    return { stdout: suppressions };
  }) as never);
}

describe('lintSuppressions', () => {
  let originalProcess: typeof globalThis.process;

  beforeEach(() => {
    originalProcess = globalThis.process;
    // The exit code is reset because it is global state that another test file
    // may have set, and `GITHUB_ACTIONS` because this suite itself runs in CI,
    // where it would otherwise be set for every test.
    globalThis.process = {
      ...globalThis.process,
      exitCode: undefined,
      env: { ...globalThis.process.env, GITHUB_ACTIONS: undefined },
    };
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    mockGit();
    jest.mocked(tscSuppressions.readSuppressions).mockResolvedValue({});
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('reads the baseline from the first parent of the merge commit CI checks out', async () => {
    process.env.GITHUB_ACTIONS = 'true';

    await lintSuppressions([]);

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['show', 'HEAD^1:oxlint-suppressions.json'],
      expect.anything(),
    );
    expect(execa).toHaveBeenCalledWith(
      'git',
      ['show', 'HEAD^1:tsc-suppressions.json'],
      expect.anything(),
    );
  });

  it('takes the merge base when running outside of CI, where a merge commit means something else', async () => {
    await lintSuppressions([]);

    expect(jest.mocked(execa)).toHaveBeenCalledWith(
      'git',
      ['merge-base', 'HEAD', 'origin/main'],
      expect.anything(),
    );
    expect(execa).toHaveBeenCalledWith(
      'git',
      ['show', 'abc123:oxlint-suppressions.json'],
      expect.anything(),
    );
    expect(execa).toHaveBeenCalledWith(
      'git',
      ['show', 'abc123:tsc-suppressions.json'],
      expect.anything(),
    );
  });

  it('takes the merge base against the branch it is given', async () => {
    await lintSuppressions(['origin/release']);

    expect(jest.mocked(execa)).toHaveBeenCalledWith(
      'git',
      ['merge-base', 'HEAD', 'origin/release'],
      expect.anything(),
    );
  });

  it('leaves the exit code alone when nothing has been added', async () => {
    await lintSuppressions([]);

    expect(process.exitCode).toBeUndefined();
  });

  it('exits with a non-zero code when a file has grown', async () => {
    jest
      .mocked(tscSuppressions.readSuppressions)
      .mockResolvedValue({ 'a.ts': { 'no-shadow': { count: 1 } } });

    await lintSuppressions([]);

    expect(process.exitCode).toBe(1);
  });

  it('throws when a baseline cannot be read, rather than passing', async () => {
    jest.mocked(execa).mockRejectedValue(new Error('unknown revision'));

    await expect(lintSuppressions([])).rejects.toThrow('unknown revision');
  });
});
