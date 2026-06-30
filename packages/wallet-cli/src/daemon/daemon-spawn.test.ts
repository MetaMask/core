import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';

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
const mockOpenSync = jest.mocked(openSync);
const mockCloseSync = jest.mocked(closeSync);
const mockPingDaemon = jest.mocked(pingDaemon);
const mockGetDaemonPaths = jest.mocked(getDaemonPaths);

// Arbitrary fd handed back by the mocked `openSync` so tests can assert it is
// wired into the child's stdio and later closed in the parent.
const LOG_FD = 7;

const CONFIG: DaemonSpawnConfig = {
  dataDir: '/tmp/data',
  infuraProjectId: 'test-key',
  password: 'test-pass',
  srp: 'test test test test test test test test test test test ball',
  packageRoot: '/pkg',
};

const ABSENT = { status: 'absent' as const };
const RESPONSIVE = { status: 'responsive' as const };
const UNREACHABLE = {
  status: 'unreachable' as const,
  reason: 'refused' as const,
  error: new Error('wedged'),
};

const UNREACHABLE_PERMISSION = {
  status: 'unreachable' as const,
  reason: 'permission' as const,
  error: new Error('EACCES'),
};

/**
 * Build a minimal mock for the `ChildProcess` returned by `spawn`. The `on`
 * handler captures `'exit'`/`'error'` listeners so tests can fire them.
 */
type SpawnMock = {
  unref: jest.Mock;
  on: jest.Mock;
  fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
};

/**
 * Build a fresh spawn mock and wire it as the return value of `mockSpawn`.
 *
 * @returns The captured handles so tests can fire lifecycle events.
 */
function setupSpawnMock(): SpawnMock {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const on = jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    listeners.set(event, handler);
  });
  const result: SpawnMock = {
    unref: jest.fn(),
    on,
    fireExit: (code, signal) => {
      listeners.get('exit')?.(code, signal);
    },
  };
  mockSpawn.mockReturnValue(result as never);
  return result;
}

describe('ensureDaemon', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockGetDaemonPaths.mockReturnValue({
      socketPath: '/tmp/test.sock',
      pidPath: '/tmp/test.pid',
      logPath: '/tmp/test.log',
      dbPath: '/tmp/wallet.db',
    });
    mockOpenSync.mockReturnValue(LOG_FD);
    setupSpawnMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns already-running when a responsive daemon already exists', async () => {
    mockPingDaemon.mockResolvedValue(RESPONSIVE);

    const result = await ensureDaemon(CONFIG);
    expect(result).toStrictEqual({
      state: 'already-running',
      socketPath: '/tmp/test.sock',
    });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('refuses to start when the socket exists but is unreachable', async () => {
    mockPingDaemon.mockResolvedValue(UNREACHABLE);

    await expect(ensureDaemon(CONFIG)).rejects.toThrow(
      /a daemon socket already exists.*unresponsive/u,
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('reports a foreign-user daemon distinctly when the ping reason is permission', async () => {
    mockPingDaemon.mockResolvedValue(UNREACHABLE_PERMISSION);

    await expect(ensureDaemon(CONFIG)).rejects.toThrow(
      /owned by another user/u,
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns daemon as detached child with correct env vars', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon(CONFIG);

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ['/pkg/dist/daemon/daemon-entry.mjs'],
      expect.objectContaining({
        detached: true,
        stdio: ['ignore', 'ignore', LOG_FD],
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

  it('redirects the daemon stderr to its log file and closes the parent fd', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon(CONFIG);

    expect(mockOpenSync).toHaveBeenCalledWith('/tmp/test.log', 'a');
    const spawnOptions = mockSpawn.mock.calls[0][2] as { stdio: unknown };
    expect(spawnOptions.stdio).toStrictEqual(['ignore', 'ignore', LOG_FD]);
    // The child dups the fd, so the parent must close its own copy.
    expect(mockCloseSync).toHaveBeenCalledWith(LOG_FD);
  });

  it('returns started when the spawned daemon becomes responsive', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    const result = await ensureDaemon(CONFIG);

    expect(result).toStrictEqual({
      state: 'started',
      socketPath: '/tmp/test.sock',
    });
  });

  it('uses dist entry when it exists', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon(CONFIG);

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toStrictEqual(['/pkg/dist/daemon/daemon-entry.mjs']);
  });

  it('falls back to src entry with tsx when dist missing', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
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
      .mockResolvedValueOnce(ABSENT) // initial check
      .mockResolvedValueOnce(ABSENT) // poll 1
      .mockResolvedValueOnce(ABSENT) // poll 2
      .mockResolvedValueOnce(RESPONSIVE); // poll 3
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon(CONFIG);

    expect(mockPingDaemon).toHaveBeenCalledTimes(4);
    expect(process.stderr.write).toHaveBeenCalledWith('Daemon ready.\n');
  });

  it('throws after timeout when daemon never responds', async () => {
    jest.useFakeTimers();
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockExistsSync.mockReturnValue(true);

    const promise = ensureDaemon(CONFIG);
    const rejection = promise.catch((thrown: unknown) => thrown);

    await jest.advanceTimersByTimeAsync(30_100);
    const thrownError = await rejection;
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe(
      'Daemon did not start within 30s',
    );
    jest.useRealTimers();
  });

  it('throws early when the child process exits during the readiness poll', async () => {
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockExistsSync.mockReturnValue(true);
    // Fire exit at the moment the daemon-spawn code registers the listener,
    // so the very first poll iteration sees exitInfo set.
    const on = jest.fn(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'exit') {
          handler(1, null);
        }
      },
    );
    mockSpawn.mockReturnValue({ unref: jest.fn(), on } as never);

    jest.useFakeTimers();
    const promise = ensureDaemon(CONFIG);
    const rejection = promise.catch((thrown: unknown) => thrown);
    await jest.advanceTimersByTimeAsync(200);

    const thrownError = await rejection;
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toContain(
      'Daemon process exited during startup',
    );
    expect((thrownError as Error).message).toContain('code=1');
    expect((thrownError as Error).message).toContain('/tmp/test.log');
  });

  it('calls unref on spawned child and registers error + exit handlers', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);
    const spawnMock = setupSpawnMock();

    await ensureDaemon(CONFIG);

    expect(spawnMock.unref).toHaveBeenCalled();
    expect(spawnMock.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(spawnMock.on).toHaveBeenCalledWith('exit', expect.any(Function));
  });

  it('throws early with the spawn error when the child fails to spawn', async () => {
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockExistsSync.mockReturnValue(true);
    // Fire 'error' at registration so the first poll iteration sees the failure.
    const on = jest.fn(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'error') {
          handler(new Error('spawn ENOENT'));
        }
      },
    );
    mockSpawn.mockReturnValue({ unref: jest.fn(), on } as never);

    jest.useFakeTimers();
    const promise = ensureDaemon(CONFIG);
    const rejection = promise.catch((thrown: unknown) => thrown);
    await jest.advanceTimersByTimeAsync(200);

    const thrownError = await rejection;
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toContain(
      'Failed to spawn daemon process',
    );
    expect((thrownError as Error).message).toContain('spawn ENOENT');
    expect((thrownError as Error).message).toContain('/tmp/test.log');
  });

  it('writes spawn errors to stderr', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    let errorHandler: ((error: Error) => void) | undefined;
    const on = jest.fn(
      (event: string, handler: (error: Error) => void): void => {
        if (event === 'error') {
          errorHandler = handler;
        }
      },
    );
    mockSpawn.mockReturnValue({ unref: jest.fn(), on } as never);

    await ensureDaemon(CONFIG);
    errorHandler?.(new Error('spawn ENOENT'));

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Failed to spawn daemon process'),
    );
  });
});
