import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./cli.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const { default: cli } = await import('./cli.js');
const { commands } = await import('./commands.js');

describe('create-package/index', () => {
  let originalProcess: typeof globalThis.process;
  beforeEach(() => {
    originalProcess = globalThis.process;
    // TODO: Replace with `jest.replaceProperty` after Jest v29 update.
    globalThis.process = { ...globalThis.process };
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('executes the CLI application', async () => {
    jest.mocked(cli).mockRejectedValue('foo');

    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./index.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(cli).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledWith(process.argv, commands);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
