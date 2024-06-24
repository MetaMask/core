import cli from './cli';
import { commands } from './commands';

jest.mock('./cli');

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
    const mock = cli as jest.MockedFunction<typeof cli>;
    mock.mockRejectedValue('foo');

    jest.spyOn(console, 'error').mockImplementation();

    // eslint-disable-next-line @typescript-eslint/no-require-imports, n/global-require
    require('.');
    await new Promise((resolve) => setImmediate(resolve));

    expect(cli).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledWith(process.argv, commands);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
