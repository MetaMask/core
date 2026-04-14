import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import { pingDaemon } from './daemon-client';
import { ensureDaemon } from './daemon-spawn';
import { getDaemonPaths } from './paths';
import type { DaemonSpawnConfig } from './types';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('./daemon-client');
jest.mock('./paths');

const mockSpawn = jest.mocked(spawn);
const mockExistsSync = jest.mocked(existsSync);
const mockPingDaemon = jest.mocked(pingDaemon);
const mockGetDaemonPaths = jest.mocked(getDaemonPaths);

const CONFIG: DaemonSpawnConfig = {
  dataDir: '/tmp/data',
  infuraProjectId: 'test-key',
  password: 'test-pass',
  srp: 'test test test test test test test test test test test ball',
  packageRoot: '/pkg',
};

describe('ensureDaemon', () => {
  beforeEach(() => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockGetDaemonPaths.mockReturnValue({
      socketPath: '/tmp/test.sock',
      pidPath: '/tmp/test.pid',
      logPath: '/tmp/test.log',
    });
    mockSpawn.mockReturnValue({
      unref: jest.fn(),
      on: jest.fn(),
    } as never);
  });

  it('returns immediately if daemon is already running', async () => {
    mockPingDaemon.mockResolvedValue(true);

    await ensureDaemon(CONFIG);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns daemon as detached child with correct env vars', async () => {
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon(CONFIG);

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ['/pkg/dist/daemon/daemon-entry.mjs'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        env: expect.objectContaining({
          MM_DAEMON_DATA_DIR: '/tmp/data',
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

    await ensureDaemon(CONFIG);

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toStrictEqual(['/pkg/dist/daemon/daemon-entry.mjs']);
  });

  it('falls back to src entry with tsx when dist missing', async () => {
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(false);

    await ensureDaemon(CONFIG);

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

    await ensureDaemon(CONFIG);

    expect(mockPingDaemon).toHaveBeenCalledTimes(4);
    expect(process.stderr.write).toHaveBeenCalledWith('Daemon ready.\n');
  });

  it('throws after timeout when daemon never responds', async () => {
    jest.useFakeTimers();
    mockPingDaemon.mockResolvedValue(false);
    mockExistsSync.mockReturnValue(true);

    const promise = ensureDaemon(CONFIG);
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

  it('calls unref on spawned child and registers error handler', async () => {
    const unref = jest.fn();
    const on = jest.fn();
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(true);
    mockSpawn.mockReturnValue({ unref, on } as never);

    await ensureDaemon(CONFIG);

    expect(unref).toHaveBeenCalled();
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('writes spawn errors to stderr', async () => {
    const unref = jest.fn();
    let errorHandler: ((error: Error) => void) | undefined;
    const on = jest.fn(
      (event: string, handler: (error: Error) => void): void => {
        if (event === 'error') {
          errorHandler = handler;
        }
      },
    );
    mockPingDaemon.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockExistsSync.mockReturnValue(true);
    mockSpawn.mockReturnValue({ unref, on } as never);

    await ensureDaemon(CONFIG);
    errorHandler?.(new Error('spawn ENOENT'));

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Failed to spawn daemon process'),
    );
  });
});
