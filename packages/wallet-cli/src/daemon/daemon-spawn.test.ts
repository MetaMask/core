import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';

import { pingDaemon } from './daemon-client';
import { ensureDaemon } from './daemon-spawn';
import { ensureOwnerOnlyDirectory } from './data-dir';
import { getDaemonPaths } from './paths';
import { Password, Srp } from './secrets';
import type { DaemonSpawnConfig } from './types';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('./daemon-client');
jest.mock('./data-dir');
jest.mock('./paths');

const mockSpawn = jest.mocked(spawn);
const mockExistsSync = jest.mocked(existsSync);
const mockOpenSync = jest.mocked(openSync);
const mockCloseSync = jest.mocked(closeSync);
const mockEnsureOwnerOnlyDirectory = jest.mocked(ensureOwnerOnlyDirectory);
const mockPingDaemon = jest.mocked(pingDaemon);
const mockGetDaemonPaths = jest.mocked(getDaemonPaths);

// Arbitrary file descriptor handed back by the mocked `openSync` so tests can
// assert it is wired into the child's stdio and later closed in the parent.
const LOG_FILE_DESCRIPTOR = 7;

const SRP =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const CONFIG: DaemonSpawnConfig = {
  dataDir: '/tmp/data',
  infuraProjectId: 'test-key',
  password: Password.from('test-pass'),
  srp: Srp.from(SRP),
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
  mockSpawn.mockReturnValue(result as unknown as ChildProcess);
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
    mockOpenSync.mockReturnValue(LOG_FILE_DESCRIPTOR);
    mockEnsureOwnerOnlyDirectory.mockResolvedValue(undefined);
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
        stdio: ['ignore', 'ignore', LOG_FILE_DESCRIPTOR],
        env: expect.objectContaining({
          MM_DAEMON_DATA_DIR: '/tmp/data',
          MM_DAEMON_SOCKET_PATH: '/tmp/test.sock',
          INFURA_PROJECT_ID: 'test-key',
          MM_WALLET_PASSWORD: 'test-pass',
          MM_WALLET_SRP: SRP,
        }),
      }),
    );
  });

  it('redirects the daemon stderr to its log file and closes the parent file descriptor', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon(CONFIG);

    expect(mockOpenSync).toHaveBeenCalledWith('/tmp/test.log', 'a');
    const spawnOptions = mockSpawn.mock.calls[0][2] as { stdio: unknown };
    expect(spawnOptions.stdio).toStrictEqual([
      'ignore',
      'ignore',
      LOG_FILE_DESCRIPTOR,
    ]);
    expect(mockCloseSync).toHaveBeenCalledWith(LOG_FILE_DESCRIPTOR);
  });

  it('propagates a log-file open failure without spawning', async () => {
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockExistsSync.mockReturnValue(true);
    mockOpenSync.mockImplementation(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });

    await expect(ensureDaemon(CONFIG)).rejects.toThrow('EACCES');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('creates the data directory before opening the log file', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);
    // The log lives inside the data dir, so the dir must be created first (else
    // openSync ENOENTs on a fresh dir).
    const order: string[] = [];
    mockEnsureOwnerOnlyDirectory.mockImplementation(async () => {
      order.push('ensureDir');
    });
    mockOpenSync.mockImplementation(() => {
      order.push('openLog');
      return LOG_FILE_DESCRIPTOR;
    });

    await ensureDaemon(CONFIG);

    expect(mockEnsureOwnerOnlyDirectory).toHaveBeenCalledWith('/tmp/data');
    expect(order).toStrictEqual(['ensureDir', 'openLog']);
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
    mockSpawn.mockReturnValue({
      unref: jest.fn(),
      on,
    } as unknown as ChildProcess);

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
    mockSpawn.mockReturnValue({
      unref: jest.fn(),
      on,
    } as unknown as ChildProcess);

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

  it('reports the spawn error when the child both errors and exits', async () => {
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockExistsSync.mockReturnValue(true);
    const on = jest.fn(
      (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'error') {
          handler(new Error('spawn ENOENT'));
        }
        if (event === 'exit') {
          handler(1, null);
        }
      },
    );
    mockSpawn.mockReturnValue({
      unref: jest.fn(),
      on,
    } as unknown as ChildProcess);

    jest.useFakeTimers();
    const promise = ensureDaemon(CONFIG);
    const rejection = promise.catch((thrown: unknown) => thrown);
    await jest.advanceTimersByTimeAsync(200);

    const thrownError = await rejection;
    expect((thrownError as Error).message).toContain(
      'Failed to spawn daemon process',
    );
  });

  it('omits MM_WALLET_PASSWORD from the child env when no password is supplied', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    // Snapshot+restore the whole env via assignment so the await between
    // mutation and restore does not trip `require-atomic-updates`.
    const savedEnv = process.env;
    process.env = { ...savedEnv, MM_WALLET_PASSWORD: 'leaked-from-parent' };
    let spawnedEnv: NodeJS.ProcessEnv | undefined;
    try {
      const { password: _password, ...configWithoutPassword } = CONFIG;
      await ensureDaemon(configWithoutPassword);
      spawnedEnv = (mockSpawn.mock.calls[0][2] as { env: NodeJS.ProcessEnv })
        .env;
    } finally {
      // Restoring after await is intentional; jest runs each test serially.
      // eslint-disable-next-line require-atomic-updates
      process.env = savedEnv;
    }

    expect(spawnedEnv).not.toHaveProperty('MM_WALLET_PASSWORD');
  });

  it('forwards an explicitly-supplied password to the child env', async () => {
    mockPingDaemon
      .mockResolvedValueOnce(ABSENT)
      .mockResolvedValueOnce(RESPONSIVE);
    mockExistsSync.mockReturnValue(true);

    await ensureDaemon({ ...CONFIG, password: Password.from('explicit-pass') });

    const spawnOpts = mockSpawn.mock.calls[0][2] as { env: NodeJS.ProcessEnv };
    expect(spawnOpts.env.MM_WALLET_PASSWORD).toBe('explicit-pass');
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
    mockSpawn.mockReturnValue({
      unref: jest.fn(),
      on,
    } as unknown as ChildProcess);

    await ensureDaemon(CONFIG);
    errorHandler?.(new Error('spawn ENOENT'));

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Failed to spawn daemon process'),
    );
  });
});
