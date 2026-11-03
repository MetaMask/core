import { execa } from 'execa';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(
  import.meta.dirname,
  'create-codeownership-summary.ts',
);

describe('create-codeownership-summary.ts', () => {
  it('prints usage for --help', async () => {
    const { stdout, exitCode } = await execa(process.execPath, [
      SCRIPT_PATH,
      '--help',
    ]);

    expect(stdout).toContain('--base-ref');
    expect(exitCode).toBe(0);
  });
});
