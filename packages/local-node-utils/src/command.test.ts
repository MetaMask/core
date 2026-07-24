/* eslint-disable jest/expect-expect */
import assert from 'node:assert/strict';

import { runCommand } from './command';

describe('runCommand', () => {
  it('runs a successful command', async () => {
    await runCommand(process.execPath, ['-e', 'process.exit(0)']);
  });

  it('rejects when a command fails', async () => {
    await assert.rejects(
      runCommand(process.execPath, ['-e', 'process.exit(2)']),
      /failed with code 2/u,
    );
  });
});
