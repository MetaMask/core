import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import { pingDaemon } from './daemon-client';
import { ensureDaemon } from './daemon-spawn';
import type { DaemonSpawnConfig } from './types';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('./daemon-client');

const mockSpawn = jest.mocked(spawn);
const mockExistsSync = jest.mocked(existsSync);
const mockPingDaemon = jest.mocked(pingDaemon);

const CONFIG: DaemonSpawnConfig = {
  dataDir: '/tmp/data',
  socketPath: '/tmp/test.sock',
  logPath: '/tmp/daemon.log',
  infuraProjectId: 'test-key',
  password: 'test-pass',
  srp: 'test test test test test test test test test test test ball',
  packageRoot: '/pkg',
};

describe('ensureDaemon', () => {
  beforeEach(() => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockSpawn.mockReturnValue({
      unref: jest.fn(),
    } as never);
  });

  it('returns immediately if daemon is already running', async () => {
    mockPingDaemon.mockResolvedValue(true);

    await ensureDaemon('/tmp/test.sock', CONFIG);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns daemon as detached child with correct env vars', async () => {
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon('/tmp/test.sock', CONFIG);

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ['/pkg/dist/daemon/daemon-entry.mjs'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        env: expect.objectContaining({
          MM_DAEMON_DATA_DIR: '/tmp/data',
          MM_DAEMON_SOCKET_PATH: '/tmp/test.sock',
          INFURA_PROJECT_ID: 'test-key',
          MM_WALLET_PASSWORD: 'test-pass',
          MM_WALLET_SRP:
            'test test test test test test test test test test test ball',
        }),
      }),
    );
  });

  it('uses dist entry when it exists', async () => {
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon('/tmp/test.sock', CONFIG);

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toStrictEqual(['/pkg/dist/daemon/daemon-entry.mjs']);
  });

  it('falls back to src entry with tsx when dist missing', async () => {
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(false);

    await ensureDaemon('/tmp/test.sock', CONFIG);

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toStrictEqual([
      '--import',
      'tsx',
      '/pkg/src/daemon/daemon-entry.ts',
    ]);
  });

  it('polls until daemon is ready', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(false) // initial check
      .mockResolvedValueOnce(false) // poll 1
      .mockResolvedValueOnce(false) // poll 2
      .mockResolvedValueOnce(true); // poll 3
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon('/tmp/test.sock', CONFIG);

    expect(mockPingDaemon).toHaveBeenCalledTimes(4);
    expect(process.stderr.write).toHaveBeenCalledWith('Daemon ready.\n');
  });

  it('throws after timeout when daemon never responds', async () => {
    jest.useFakeTimers();
    mockPingDaemon.mockResolvedValue(false);
    mockExistsSync.mockReturnValue(true);

    const promise = ensureDaemon('/tmp/test.sock', CONFIG);
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const rejection = promise.catch((thrown: unknown) => thrown);

    // Advance past all 300 polls (100ms each = 30s)
    await jest.advanceTimersByTimeAsync(30_100);
    const thrownError = await rejection;
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe(
      'Daemon did not start within 30s',
    );
    jest.useRealTimers();
  });

  it('calls unref on spawned child', async () => {
    const unref = jest.fn();
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(true);
    mockSpawn.mockReturnValue({ unref } as never);

    await ensureDaemon('/tmp/test.sock', CONFIG);

    expect(unref).toHaveBeenCalled();
  });
});
