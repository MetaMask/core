import { Command } from '@oclif/core';
import type { Config } from '@oclif/core';
import { CLIError } from '@oclif/core/errors';

type CommandCtor = new (
  argv: string[],
  config: Config,
) => Command & {
  _run: () => Promise<unknown>;
};

const TEST_DATA_DIR = '/tmp/mm-cli-test-data';
const TEST_PACKAGE_ROOT = '/tmp/mm-cli-test-root';

/**
 * Invoke an oclif command class with the given argv and return the captured
 * stdout/stderr/error so tests can assert on them.
 *
 * Bypasses `Command.run`'s static plugin-loading path (which requires a real
 * `Config.load`) by constructing the command instance directly with a
 * hand-rolled `Config` and invoking the protected `_run`. Spies on the
 * Command prototype so `this.log` and `this.error` go to local buffers
 * instead of stdout/stderr.
 *
 * @param CommandClass - The command class (a subclass of `@oclif/core` Command).
 * @param argv - Command-line tokens (flags + positional args).
 * @returns Captured stdout, stderr, and any `this.error()` payload.
 */
export async function runCommand(
  CommandClass: CommandCtor,
  argv: string[] = [],
): Promise<{
  stdout: string;
  stderr: string;
  error: CLIError | undefined;
}> {
  let stdout = '';
  let stderr = '';
  let error: CLIError | undefined;

  const fakeConfig = {
    dataDir: TEST_DATA_DIR,
    root: TEST_PACKAGE_ROOT,
    bin: 'mm',
    name: '@metamask/wallet-cli',
    version: '0.0.0-test',
    pjson: { name: '@metamask/wallet-cli', version: '0.0.0-test' },
    findCommand: () => undefined,
    runHook: async () => ({ successes: [], failures: [] }),
    scopedEnvVar: () => undefined,
    scopedEnvVarKey: () => '',
    scopedEnvVarKeys: () => [],
    scopedEnvVarTrue: () => false,
    plugins: new Map(),
    flexibleTaxonomy: false,
  } as unknown as Config;

  const logSpy = jest
    .spyOn(Command.prototype, 'log')
    .mockImplementation((message: unknown = '') => {
      stdout += `${String(message)}\n`;
    });
  const errorSpy = jest
    .spyOn(Command.prototype, 'error')
    .mockImplementation((input: string | Error) => {
      const message = typeof input === 'string' ? input : input.message;
      throw new CLIError(message);
    });

  try {
    const instance = new CommandClass(argv, fakeConfig);
    await instance._run();
  } catch (caught: unknown) {
    if (caught instanceof CLIError) {
      error = caught;
      stderr += `${caught.message}\n`;
    } else {
      throw caught;
    }
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }

  return { stdout, stderr, error };
}
