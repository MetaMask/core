import { rm } from 'node:fs/promises';

import { pingDaemon } from '../../daemon/daemon-client';
import { confirmPurge } from '../../daemon/prompts';
import { stopDaemon } from '../../daemon/stop-daemon';
import { runCommand } from '../../test/run-command';
import DaemonPurge from './purge';

jest.mock('node:fs/promises');
jest.mock('../../daemon/daemon-client');
jest.mock('../../daemon/stop-daemon');
jest.mock('../../daemon/prompts');

const inquirerConfirm = jest.mocked(confirmPurge);
const mockRm = jest.mocked(rm);
const mockPingDaemon = jest.mocked(pingDaemon);
const mockStopDaemon = jest.mocked(stopDaemon);

describe('daemon purge', () => {
  beforeEach(() => {
    mockRm.mockResolvedValue(undefined);
    inquirerConfirm.mockResolvedValue(true);
  });

  it('aborts without prompting nor deleting when the user declines', async () => {
    inquirerConfirm.mockResolvedValue(false);

    const { stdout, error } = await runCommand(DaemonPurge);

    expect(stdout).toContain('Aborted.');
    expect(mockStopDaemon).not.toHaveBeenCalled();
    expect(mockRm).not.toHaveBeenCalled();
    expect(error).toBeUndefined();
  });

  it('--force skips the confirmation prompt', async () => {
    mockStopDaemon.mockResolvedValue(true);

    await runCommand(DaemonPurge, ['--force']);

    expect(inquirerConfirm).not.toHaveBeenCalled();
    expect(mockStopDaemon).toHaveBeenCalled();
  });

  it('threads its log callback into stopDaemon so daemon-side messages reach the user', async () => {
    mockStopDaemon.mockImplementation(async (_socket, _pid, log) => {
      log?.('Stopping daemon...');
      return true;
    });

    const { stdout } = await runCommand(DaemonPurge, ['--force']);

    expect(stdout).toContain('Stopping daemon...');
  });

  it('refuses to delete state when the daemon is still responsive', async () => {
    mockStopDaemon.mockResolvedValue(false);
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });

    const { error } = await runCommand(DaemonPurge, ['--force']);

    expect(error?.message).toContain('still responsive');
    expect(mockRm).not.toHaveBeenCalled();
  });

  it('proceeds to delete the whitelist when stopDaemon returns false but the daemon is unresponsive', async () => {
    mockStopDaemon.mockResolvedValue(false);
    mockPingDaemon.mockResolvedValue({
      status: 'unreachable',
      reason: 'refused',
      error: new Error('refused'),
    });

    const { stdout } = await runCommand(DaemonPurge, ['--force']);

    expect(stdout).toContain('Could not confirm clean shutdown');
    expect(stdout).toContain('All daemon state deleted.');
  });

  it('proceeds when stopDaemon returns false and the daemon is absent', async () => {
    mockStopDaemon.mockResolvedValue(false);
    mockPingDaemon.mockResolvedValue({ status: 'absent' });

    const { stdout } = await runCommand(DaemonPurge, ['--force']);

    expect(stdout).toContain('All daemon state deleted.');
  });

  it('deletes only the whitelisted daemon files (not the entire dataDir)', async () => {
    mockStopDaemon.mockResolvedValue(true);

    await runCommand(DaemonPurge, ['--force']);

    const removed = mockRm.mock.calls.map(([path]) => path);
    expect(removed).not.toContain('/tmp/mm-cli-test-data');
    expect(removed.some((path) => String(path).endsWith('daemon.pid'))).toBe(
      true,
    );
    expect(removed.some((path) => String(path).endsWith('daemon.sock'))).toBe(
      true,
    );
    expect(removed.some((path) => String(path).endsWith('daemon.log'))).toBe(
      true,
    );
    expect(removed.some((path) => String(path).endsWith('wallet.db'))).toBe(
      true,
    );
    expect(removed.some((path) => String(path).endsWith('wallet.db-wal'))).toBe(
      true,
    );
    expect(removed.some((path) => String(path).endsWith('wallet.db-shm'))).toBe(
      true,
    );
  });
});
