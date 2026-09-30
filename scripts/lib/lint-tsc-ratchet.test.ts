import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

jest.unstable_mockModule('./tsc-suppressions.ts', () => ({
  findAddedSuppressions: jest.fn(),
  printAddedSuppressions: jest.fn(),
  readSuppressions: jest.fn(),
}));

const { execa } = await import('execa');
const tscSuppressions = await import('./tsc-suppressions.ts');
const { lintTscRatchet } = await import('./lint-tsc-ratchet.ts');

const BASE = { 'a.ts': { TS2322: { count: 2 } } };
const CURRENT = { 'a.ts': { TS2322: { count: 1 } } };

const ADDITION = {
  filePath: 'a.ts',
  code: 'TS2322',
  count: 3,
  baseCount: 2,
};

describe('lintTscRatchet', () => {
  let originalProcess: typeof globalThis.process;

  beforeEach(() => {
    originalProcess = globalThis.process;
    // The exit code is reset because it is global state that another test file
    // may have set.
    globalThis.process = { ...globalThis.process, exitCode: undefined };
    jest.spyOn(console, 'log').mockReturnValue(undefined);
    jest.mocked(execa).mockResolvedValue({
      stdout: JSON.stringify(BASE),
    } as never);
    jest.mocked(tscSuppressions.readSuppressions).mockResolvedValue(CURRENT);
    jest.mocked(tscSuppressions.findAddedSuppressions).mockReturnValue([]);
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('compares against the first parent of the merge commit CI checks out', async () => {
    await lintTscRatchet([]);

    expect(jest.mocked(execa).mock.calls[0]?.slice(0, 2)).toStrictEqual([
      'git',
      ['show', 'HEAD^1:tsc-suppressions.json'],
    ]);
    expect(tscSuppressions.findAddedSuppressions).toHaveBeenCalledWith({
      current: CURRENT,
      base: BASE,
    });
  });

  it('compares against the ref it is given', async () => {
    await lintTscRatchet(['origin/main']);

    expect(jest.mocked(execa).mock.calls[0]?.slice(0, 2)).toStrictEqual([
      'git',
      ['show', 'origin/main:tsc-suppressions.json'],
    ]);
  });

  it('leaves the exit code alone when nothing has been added', async () => {
    await lintTscRatchet([]);

    expect(tscSuppressions.printAddedSuppressions).toHaveBeenCalledWith([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('exits with a non-zero code when suppressions have been added', async () => {
    jest
      .mocked(tscSuppressions.findAddedSuppressions)
      .mockReturnValue([ADDITION]);

    await lintTscRatchet([]);

    expect(tscSuppressions.printAddedSuppressions).toHaveBeenCalledWith([
      ADDITION,
    ]);
    expect(process.exitCode).toBe(1);
  });

  it('throws when the baseline cannot be read, rather than passing', async () => {
    jest.mocked(execa).mockRejectedValue(new Error('unknown revision'));

    await expect(lintTscRatchet([])).rejects.toThrow('unknown revision');
    expect(tscSuppressions.findAddedSuppressions).not.toHaveBeenCalled();
  });
});
