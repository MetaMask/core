import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('execa', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.unstable_mockModule('./tsc-suppressions.js', () => ({
  parseTscOutput: jest.fn(),
  findFilelessDiagnostics: jest.fn(),
  buildSuppressions: jest.fn(),
  compareErrorsToSuppressions: jest.fn(),
  readSuppressions: jest.fn(),
  writeSuppressions: jest.fn(),
  printReport: jest.fn(),
}));

const { default: execa } = await import('execa');
const tscSuppressions = await import('./tsc-suppressions.js');
const { lintTsc } = await import('./lint-tsc.js');

const ERROR = { filePath: 'a.ts', code: 'TS2322', message: 'Nope.' };

const PASSING_REPORT = {
  unsuppressedErrors: [],
  staleSuppressions: [],
  didPass: true,
};

/**
 * Stubs a `tsc` run which produces the given output and one parsed error.
 *
 * @param output - The output that `tsc` should produce.
 * @param exitCode - The code that `tsc` should exit with. It exits non-zero
 * whenever it reports errors, so that is the default.
 */
function mockTscRun(output: string, exitCode = 1): void {
  jest.mocked(execa).mockResolvedValue({ all: output, exitCode } as never);
  jest.mocked(tscSuppressions.parseTscOutput).mockReturnValue([ERROR]);
  jest.mocked(tscSuppressions.findFilelessDiagnostics).mockReturnValue([]);
}

describe('lintTsc', () => {
  let originalProcess: typeof globalThis.process;

  beforeEach(() => {
    originalProcess = globalThis.process;
    // The exit code is reset because it is global state that another test file
    // may have set.
    globalThis.process = { ...globalThis.process, exitCode: undefined };
    jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('typechecks every package in the repo, capturing errors rather than throwing', async () => {
    mockTscRun('');
    jest
      .mocked(tscSuppressions.compareErrorsToSuppressions)
      .mockReturnValue(PASSING_REPORT);

    await lintTsc([]);

    expect(execa).toHaveBeenCalledWith(
      'tsc',
      ['--build', 'tsconfig.lint.json', '--pretty', 'false'],
      expect.objectContaining({ reject: false, all: true }),
    );
  });

  it('checks the parsed errors against the suppressions file', async () => {
    mockTscRun('a.ts(1,1): error TS2322: Nope.');
    const suppressions = { 'a.ts': { TS2322: { count: 1 } } };
    jest
      .mocked(tscSuppressions.readSuppressions)
      .mockResolvedValue(suppressions);
    jest
      .mocked(tscSuppressions.compareErrorsToSuppressions)
      .mockReturnValue(PASSING_REPORT);

    await lintTsc([]);

    expect(tscSuppressions.parseTscOutput).toHaveBeenCalledWith(
      'a.ts(1,1): error TS2322: Nope.',
    );
    expect(tscSuppressions.compareErrorsToSuppressions).toHaveBeenCalledWith({
      errors: [ERROR],
      suppressions,
    });
  });

  it('prints the report and leaves the exit code alone when the check passes', async () => {
    mockTscRun('');
    jest
      .mocked(tscSuppressions.compareErrorsToSuppressions)
      .mockReturnValue(PASSING_REPORT);

    await lintTsc([]);

    expect(tscSuppressions.printReport).toHaveBeenCalledWith(PASSING_REPORT);
    expect(process.exitCode).toBeUndefined();
  });

  it('exits with a non-zero code when the check fails', async () => {
    mockTscRun('');
    jest.mocked(tscSuppressions.compareErrorsToSuppressions).mockReturnValue({
      unsuppressedErrors: [
        {
          filePath: 'a.ts',
          code: 'TS2322',
          count: 1,
          suppressedCount: 0,
          messages: ['Nope.'],
        },
      ],
      staleSuppressions: [],
      didPass: false,
    });

    await lintTsc([]);

    expect(process.exitCode).toBe(1);
  });

  it('treats a successful run that produces no output as having no errors', async () => {
    jest
      .mocked(execa)
      .mockResolvedValue({ all: undefined, exitCode: 0 } as never);
    jest.mocked(tscSuppressions.parseTscOutput).mockReturnValue([]);
    jest.mocked(tscSuppressions.findFilelessDiagnostics).mockReturnValue([]);
    jest
      .mocked(tscSuppressions.compareErrorsToSuppressions)
      .mockReturnValue(PASSING_REPORT);

    await lintTsc([]);

    expect(tscSuppressions.parseTscOutput).toHaveBeenCalledWith('');
  });

  it('throws when tsc fails without reporting any type errors', async () => {
    jest.mocked(execa).mockResolvedValue({
      all: 'boom',
      exitCode: 1,
    } as never);
    jest.mocked(tscSuppressions.parseTscOutput).mockReturnValue([]);
    jest.mocked(tscSuppressions.findFilelessDiagnostics).mockReturnValue([]);

    await expect(lintTsc([])).rejects.toThrow(
      '`tsc` failed for a reason other than the type errors it reported.',
    );
    expect(tscSuppressions.compareErrorsToSuppressions).not.toHaveBeenCalled();
  });

  it('does not throw when tsc exits non-zero but reports type errors, as those may be suppressed', async () => {
    mockTscRun('a.ts(1,1): error TS2322: Nope.');
    jest
      .mocked(tscSuppressions.compareErrorsToSuppressions)
      .mockReturnValue(PASSING_REPORT);

    await lintTsc([]);

    expect(tscSuppressions.printReport).toHaveBeenCalledWith(PASSING_REPORT);
  });

  it('throws when tsc reports a diagnostic that belongs to no file, even though type errors were reported too', async () => {
    mockTscRun('a.ts(1,1): error TS2322: Nope.');
    jest
      .mocked(tscSuppressions.findFilelessDiagnostics)
      .mockReturnValue(["error TS6053: File 'nope.json' not found."]);

    await expect(lintTsc([])).rejects.toThrow(
      '`tsc` failed for a reason other than the type errors it reported.',
    );
    expect(tscSuppressions.compareErrorsToSuppressions).not.toHaveBeenCalled();
  });

  it('rewrites the suppressions file when given --update, without failing', async () => {
    mockTscRun('');
    const suppressions = { 'a.ts': { TS2322: { count: 1 } } };
    jest
      .mocked(tscSuppressions.buildSuppressions)
      .mockReturnValue(suppressions);

    await lintTsc(['--update']);

    expect(tscSuppressions.buildSuppressions).toHaveBeenCalledWith([ERROR]);
    expect(tscSuppressions.writeSuppressions).toHaveBeenCalledWith(
      expect.objectContaining({ suppressions }),
    );
    expect(tscSuppressions.compareErrorsToSuppressions).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
