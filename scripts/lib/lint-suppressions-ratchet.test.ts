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
const {
  findAddedSuppressions,
  printAddedSuppressions,
  lintSuppressionsRatchet,
} = await import('./lint-suppressions-ratchet.ts');

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

describe('lintSuppressionsRatchet', () => {
  let originalProcess: typeof globalThis.process;

  beforeEach(() => {
    originalProcess = globalThis.process;
    // The exit code is reset because it is global state that another test file
    // may have set.
    globalThis.process = { ...globalThis.process, exitCode: undefined };
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    jest.mocked(execa).mockResolvedValue({ stdout: '{}' } as never);
    jest.mocked(tscSuppressions.readSuppressions).mockResolvedValue({});
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('checks both suppressions files against the merge commit CI checks out', async () => {
    await lintSuppressionsRatchet([]);

    expect(jest.mocked(execa).mock.calls.map((call) => call[1])).toStrictEqual([
      ['show', 'HEAD^1:oxlint-suppressions.json'],
      ['show', 'HEAD^1:tsc-suppressions.json'],
    ]);
  });

  it('checks them against the ref it is given', async () => {
    await lintSuppressionsRatchet(['origin/main']);

    expect(jest.mocked(execa).mock.calls.map((call) => call[1])).toStrictEqual([
      ['show', 'origin/main:oxlint-suppressions.json'],
      ['show', 'origin/main:tsc-suppressions.json'],
    ]);
  });

  it('leaves the exit code alone when nothing has been added', async () => {
    await lintSuppressionsRatchet([]);

    expect(process.exitCode).toBeUndefined();
  });

  it('exits with a non-zero code when a file has grown', async () => {
    jest
      .mocked(tscSuppressions.readSuppressions)
      .mockResolvedValue({ 'a.ts': { 'no-shadow': { count: 1 } } });

    await lintSuppressionsRatchet([]);

    expect(process.exitCode).toBe(1);
  });

  it('throws when a baseline cannot be read, rather than passing', async () => {
    jest.mocked(execa).mockRejectedValue(new Error('unknown revision'));

    await expect(lintSuppressionsRatchet([])).rejects.toThrow(
      'unknown revision',
    );
  });
});
