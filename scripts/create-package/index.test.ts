import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import cli from './cli.ts';
import { commands } from './commands.ts';

vi.mock(import('./cli.ts'), () => ({
  default: vi.fn(),
}));

describe('create-package/index', () => {
  let originalProcess: typeof globalThis.process;
  beforeEach(() => {
    originalProcess = globalThis.process;
    globalThis.process = { ...globalThis.process };
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('executes the CLI application', async () => {
    vi.mocked(cli).mockRejectedValue('foo');

    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./index.ts');
    await new Promise((resolve) => setImmediate(resolve));

    expect(cli).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledWith(process.argv, commands);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
