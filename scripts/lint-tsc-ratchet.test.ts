import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./lib/lint-tsc-ratchet.js', () => ({
  lintTscRatchet: jest.fn(),
}));

const { lintTscRatchet } = await import('./lib/lint-tsc-ratchet.js');

describe('lint-tsc-ratchet', () => {
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

  it('runs the check, reporting any error it throws', async () => {
    jest.mocked(lintTscRatchet).mockRejectedValue('foo');
    jest.spyOn(console, 'error').mockReturnValue(undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./lint-tsc-ratchet.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(lintTscRatchet).toHaveBeenCalledTimes(1);
    expect(lintTscRatchet).toHaveBeenCalledWith(process.argv.slice(2));
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
