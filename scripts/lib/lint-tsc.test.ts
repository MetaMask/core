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
 */
function mockTscRun(output: string): void {
  jest.mocked(execa).mockResolvedValue({ all: output } as never);
  jest.mocked(tscSuppressions.parseTscOutput).mockReturnValue([ERROR]);
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

  it('treats a run that produces no output as having no errors', async () => {
    jest.mocked(execa).mockResolvedValue({ all: undefined } as never);
    jest.mocked(tscSuppressions.parseTscOutput).mockReturnValue([]);
    jest
      .mocked(tscSuppressions.compareErrorsToSuppressions)
      .mockReturnValue(PASSING_REPORT);

    await lintTsc([]);

    expect(tscSuppressions.parseTscOutput).toHaveBeenCalledWith('');
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
