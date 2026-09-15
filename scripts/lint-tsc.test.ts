import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./lib/lint-tsc.js', () => ({
  lintTsc: jest.fn(),
}));

const { lintTsc } = await import('./lib/lint-tsc.js');

describe('lint-tsc', () => {
  let originalProcess: typeof globalThis.process;

  beforeEach(() => {
    originalProcess = globalThis.process;
    // The exit code is reset because it is global state that another test file
    // may have set.
    globalThis.process = { ...globalThis.process, exitCode: undefined };
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('runs the linter, reporting any error it throws', async () => {
    jest.mocked(lintTsc).mockRejectedValue('foo');
    jest.spyOn(console, 'error').mockReturnValue(undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./lint-tsc.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(lintTsc).toHaveBeenCalledTimes(1);
    expect(lintTsc).toHaveBeenCalledWith(process.argv.slice(2));
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
