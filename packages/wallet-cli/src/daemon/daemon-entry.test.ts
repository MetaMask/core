import { validate } from '@metamask/superstruct';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';

import { pingDaemon } from './daemon-client';
import { ensureOwnerOnlyDirectory } from './data-dir';
import { getDaemonPaths } from './paths';
import { startRpcSocketServer } from './rpc-socket-server';
import type { RpcSocketServerHandle } from './rpc-socket-server';
import { isProcessAlive } from './utils';
import { createWallet } from './wallet-factory';

jest.mock('node:fs/promises');
jest.mock('./data-dir');
jest.mock('./daemon-client');
jest.mock('./paths');
jest.mock('./rpc-socket-server');
jest.mock('./utils', () => {
  const actual = jest.requireActual('./utils');
  return {
    ...actual,
    isProcessAlive: jest.fn(),
  };
});
jest.mock('./wallet-factory');

const mockEnsureOwnerOnlyDirectory = jest.mocked(ensureOwnerOnlyDirectory);
const mockAppendFile = jest.mocked(appendFile);
const mockReadFile = jest.mocked(readFile);
const mockWriteFile = jest.mocked(writeFile);
const mockRm = jest.mocked(rm);
const mockPingDaemon = jest.mocked(pingDaemon);
const mockGetDaemonPaths = jest.mocked(getDaemonPaths);
const mockStartRpcSocketServer = jest.mocked(startRpcSocketServer);
const mockCreateWallet = jest.mocked(createWallet);
const mockIsProcessAlive = jest.mocked(isProcessAlive);

const ORIGINAL_ENV = process.env;

const ABSENT = { status: 'absent' as const };
const RESPONSIVE = { status: 'responsive' as const };
const UNREACHABLE = {
  status: 'unreachable' as const,
  reason: 'refused' as const,
  error: new Error('wedged'),
};

type MockCreateWalletResult = Awaited<ReturnType<typeof createWallet>>;

/**
 * Build an ENOENT NodeJS.ErrnoException for fs/promises mock rejections.
 *
 * @returns An error mimicking what `readFile` throws when a file is missing.
 */
function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error('not found'), { code: 'ENOENT' });
}

/**
 * Create a mock createWallet result with a mocked wallet and dispose handle.
 *
 * @returns A mock createWallet result.
 */
function createMockWallet(): MockCreateWalletResult {
  return {
    wallet: {
      messenger: {
        call: jest.fn(),
        getRegisteredActionTypes: jest.fn().mockReturnValue([]),
      },
      state: {},
    },
    dispose: jest.fn().mockResolvedValue(undefined),
  } as unknown as MockCreateWalletResult;
}

/**
 * Create a mock server handle.
 *
 * @returns A mock server handle.
 */
function createMockHandle(): RpcSocketServerHandle {
  return { close: jest.fn().mockResolvedValue(undefined) };
}

describe('daemon-entry', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.MM_DAEMON_DATA_DIR = '/tmp/data';
    process.env.INFURA_PROJECT_ID = 'key';
    process.env.MM_WALLET_PASSWORD = 'pass';
    process.env.MM_WALLET_SRP =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    process.exitCode = undefined;
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    mockGetDaemonPaths.mockReturnValue({
      socketPath: '/tmp/daemon.sock',
      pidPath: '/tmp/daemon.pid',
      logPath: '/tmp/daemon.log',
      dbPath: '/tmp/wallet.db',
    });
    // Default: no prior daemon state (pre-flight readFile + ownership readFile
    // both miss). Tests that need a stale PID file override these per-call.
    mockReadFile.mockRejectedValue(enoent());
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    mockEnsureOwnerOnlyDirectory.mockResolvedValue(undefined);
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockIsProcessAlive.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    process.exitCode = undefined;
  });

  /**
   * Import daemon-entry in an isolated module scope so its top-level
   * main() runs with the current mocks and env vars.
   * Returns after main() settles.
   */
  async function importDaemonEntry(): Promise<void> {
    await jest.isolateModulesAsync(async () => {
      await import('./daemon-entry');
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => process.nextTick(resolve));
      }
    });
  }

  it('writes to stderr and sets exitCode when MM_DAEMON_DATA_DIR is missing', async () => {
    delete process.env.MM_DAEMON_DATA_DIR;

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('MM_DAEMON_DATA_DIR'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('writes to stderr and sets exitCode when INFURA_PROJECT_ID is missing', async () => {
    delete process.env.INFURA_PROJECT_ID;

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFURA_PROJECT_ID'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('writes to stderr and sets exitCode when MM_WALLET_PASSWORD is missing', async () => {
    delete process.env.MM_WALLET_PASSWORD;

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('MM_WALLET_PASSWORD'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('writes to stderr and sets exitCode when MM_WALLET_SRP is missing', async () => {
    delete process.env.MM_WALLET_SRP;

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('MM_WALLET_SRP'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('creates data dir, wallet, server, and writes PID exclusively on successful startup', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    expect(mockEnsureOwnerOnlyDirectory).toHaveBeenCalledWith('/tmp/data');
    expect(mockCreateWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        databasePath: '/tmp/wallet.db',
        infuraProjectId: 'key',
        log: expect.any(Function),
      }),
    );
    // The Password/Srp instances are constructed in an isolated module scope
    // (jest.isolateModulesAsync), so their class identity differs from any
    // import in this test file. Verify structurally via `.unwrap()`.
    const passedConfig = mockCreateWallet.mock.calls[0][0];
    expect(passedConfig.password.unwrap()).toBe('pass');
    expect(passedConfig.srp.unwrap()).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/daemon.pid',
      expect.stringMatching(new RegExp(`^${process.pid}\\n\\d+\\n$`, 'u')),
      { flag: 'wx' },
    );
    expect(mockStartRpcSocketServer).toHaveBeenCalledWith(
      expect.objectContaining({
        socketPath: '/tmp/daemon.sock',
      }),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('scrubs the wallet secrets from the environment once captured', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    // The captured values still reach createWallet (as opaque Password/Srp
    // instances, verified structurally via `.unwrap()`)...
    const passedConfig = mockCreateWallet.mock.calls[0][0];
    expect(passedConfig.password.unwrap()).toBe('pass');
    expect(passedConfig.srp.unwrap()).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    // ...but no longer linger in the long-lived daemon's environment.
    expect(process.env.MM_WALLET_PASSWORD).toBeUndefined();
    expect(process.env.MM_WALLET_SRP).toBeUndefined();
  });

  it('scrubs wallet secrets even when Srp.from throws on an invalid mnemonic', async () => {
    process.env.MM_WALLET_SRP = 'not a valid mnemonic at all';

    await importDaemonEntry();

    expect(process.exitCode).toBe(1);
    expect(process.env.MM_WALLET_PASSWORD).toBeUndefined();
    expect(process.env.MM_WALLET_SRP).toBeUndefined();
  });

  it('uses MM_DAEMON_SOCKET_PATH override when set', async () => {
    process.env.MM_DAEMON_SOCKET_PATH = '/custom/sock';

    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    expect(mockStartRpcSocketServer).toHaveBeenCalledWith(
      expect.objectContaining({
        socketPath: '/custom/sock',
      }),
    );
  });

  it('refuses to start when a responsive daemon already owns the socket', async () => {
    mockReadFile.mockResolvedValue('9999\n12345\n');
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockCreateWallet.mockResolvedValue(createMockWallet());

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('A daemon is already running'),
    );
    expect(process.exitCode).toBe(1);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuses to start when a responsive daemon owns the socket without a PID file', async () => {
    // No PID file (ENOENT default) but pingDaemon returns responsive.
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockCreateWallet.mockResolvedValue(createMockWallet());

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('A daemon is already running'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('removes a stale unreachable socket file when no PID file is present', async () => {
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.sock', { force: true });
    expect(mockAppendFile).toHaveBeenCalledWith(
      '/tmp/daemon.log',
      expect.stringContaining('Removing stale socket'),
    );
  });

  it('surfaces non-ENOENT errors from reading the existing PID file during pre-flight', async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('read denied'), { code: 'EACCES' }),
    );
    mockCreateWallet.mockResolvedValue(createMockWallet());

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('read denied'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('treats a malformed PID file as having no PID (takes over the slot)', async () => {
    mockReadFile.mockResolvedValueOnce('not-a-number\n');
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    // Pre-flight treated the file as if no PID was present (existingPid === undefined),
    // pinged, found nothing, then removed the stale socket. No error.
    expect(process.exitCode).toBeUndefined();
    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.sock', { force: true });
  });

  it('clears stale PID + socket files when the recorded daemon is no longer responsive', async () => {
    // PID file is present and pingDaemon returns absent → take over.
    mockReadFile.mockResolvedValueOnce('9999\n12345\n');
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.sock', { force: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/daemon.pid',
      expect.any(String),
      { flag: 'wx' },
    );
  });

  it('disposes the wallet and removes the PID file when the server fails to start', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    mockStartRpcSocketServer.mockRejectedValue(new Error('server failed'));
    // Second readFile call (ownership check during cleanup) sees the PID
    // file we just wrote — return matching contents so removal proceeds.
    mockReadFile
      .mockRejectedValueOnce(enoent()) // pre-flight readPidFromFile
      .mockImplementation(async () => {
        const lastWrite = mockWriteFile.mock.calls.at(-1)?.[1];
        return typeof lastWrite === 'string' ? lastWrite : '';
      });

    await importDaemonEntry();

    expect(result.dispose).toHaveBeenCalled();
    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
    expect(process.exitCode).toBe(1);
  });

  it('removes the PID file when createWallet itself fails (no dispose handle yet)', async () => {
    mockCreateWallet.mockRejectedValue(new Error('wallet failed'));
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockImplementation(async () => {
        const lastWrite = mockWriteFile.mock.calls.at(-1)?.[1];
        return typeof lastWrite === 'string' ? lastWrite : '';
      });

    await importDaemonEntry();

    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
    expect(process.exitCode).toBe(1);
  });

  it('aborts when another daemon wins the exclusive PID-file write race', async () => {
    // Simulate two daemons reaching the wx write nearly simultaneously: pre-flight
    // sees no PID file (ENOENT), but writeFile rejects with EEXIST because a
    // sibling already claimed the slot. Since the slot write now happens BEFORE
    // createWallet, we never construct a wallet or open the DB.
    const eexist = Object.assign(new Error('already exists'), {
      code: 'EEXIST',
    });
    mockWriteFile.mockRejectedValue(eexist);

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('already exists'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to claim daemon slot'),
    );
    expect(process.exitCode).toBe(1);
    // Wallet must NOT be constructed when the slot write loses the race —
    // this is the whole point of writing the PID before opening the DB.
    expect(mockCreateWallet).not.toHaveBeenCalled();
  });

  it('refuses to take over an unreachable socket whose recorded PID is alive', async () => {
    mockReadFile.mockResolvedValue('9999\n12345\n');
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockIsProcessAlive.mockReturnValue(true);
    mockCreateWallet.mockResolvedValue(createMockWallet());

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('A daemon is already running'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('socket at /tmp/daemon.sock is unresponsive'),
    );
    expect(process.exitCode).toBe(1);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuses to take over when the socket is absent but the recorded PID is alive', async () => {
    mockReadFile.mockResolvedValue('9999\n12345\n');
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockIsProcessAlive.mockReturnValue(true);
    mockCreateWallet.mockResolvedValue(createMockWallet());

    await importDaemonEntry();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('A daemon is already running'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('pid is still alive'),
    );
    expect(process.exitCode).toBe(1);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('clears a corrupt PID file along with the socket so wx write can succeed', async () => {
    // Pre-flight readPidFile returns undefined for a file that exists but
    // doesn't parse as an integer (e.g. truncated/torn write from a crash).
    // Without the rm pidPath in claimDaemonSlot, the wx write would fail
    // with EEXIST and the daemon couldn't start.
    mockReadFile.mockResolvedValueOnce('garbage-not-a-number\n');
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.sock', { force: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/daemon.pid',
      expect.any(String),
      { flag: 'wx' },
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('does not remove the PID file during cleanup if its contents no longer match', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    mockStartRpcSocketServer.mockRejectedValue(new Error('server failed'));
    // Pre-flight finds no PID file (ENOENT). Cleanup readFile returns
    // unrelated contents (a different daemon's PID file) — must not rm
    // the sibling's file during cleanup.
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockResolvedValueOnce('99999\n9999999\n');

    await importDaemonEntry();

    // Pre-flight unconditionally rms pidPath once; cleanup must NOT add
    // a second rm because removeOwnedPidFile saw mismatched contents.
    const pidRmCalls = mockRm.mock.calls.filter(
      ([path]) => path === '/tmp/daemon.pid',
    );
    expect(pidRmCalls).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });

  it('logs and continues when ownership-aware PID removal throws during error cleanup', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    mockStartRpcSocketServer.mockRejectedValue(new Error('server failed'));
    // Force ownership check (readFile) to throw non-ENOENT so removeOwnedPidFile rejects.
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockRejectedValueOnce(
        Object.assign(new Error('read denied'), { code: 'EACCES' }),
      );

    await importDaemonEntry();

    expect(mockAppendFile).toHaveBeenCalledWith(
      '/tmp/daemon.log',
      expect.stringContaining('Failed to remove PID file during cleanup'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('exposes getStatus handler that returns pid and uptime', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const { handlers } = callArgs;
    const status = (await handlers.getStatus.run(null)) as {
      pid: number;
      uptime: number;
    };

    expect(status.pid).toBe(process.pid);
    expect(typeof status.uptime).toBe('number');
  });

  it('exposes listActions handler that returns the messenger action types', async () => {
    const mock = createMockWallet();
    (
      mock.wallet.messenger.getRegisteredActionTypes as jest.Mock
    ).mockReturnValue([
      'NetworkController:getState',
      'KeyringController:getState',
    ]);
    mockCreateWallet.mockResolvedValue(mock);
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    const { handlers } = mockStartRpcSocketServer.mock.calls[0][0];
    const actions = await handlers.listActions.run(null);

    expect(actions).toStrictEqual([
      'NetworkController:getState',
      'KeyringController:getState',
    ]);
  });

  it('getStatus paramsStruct rejects non-null params', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    const { handlers } = mockStartRpcSocketServer.mock.calls[0][0];
    const [error] = validate(['unexpected'], handlers.getStatus.paramsStruct);
    expect(error).toBeDefined();
  });

  it('listActions paramsStruct rejects non-null params', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    const { handlers } = mockStartRpcSocketServer.mock.calls[0][0];
    const [error] = validate(['unexpected'], handlers.listActions.paramsStruct);
    expect(error).toBeDefined();
  });

  it('logs to file via makeLogger', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    expect(mockAppendFile).toHaveBeenCalledWith(
      '/tmp/daemon.log',
      expect.stringContaining('Starting daemon...'),
    );
  });

  it('writes to stderr when appendFile fails in makeLogger', async () => {
    mockAppendFile.mockRejectedValue(new Error('disk full'));
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => process.nextTick(resolve));
    }

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('log write failed'),
    );
  });

  it('registers SIGTERM and SIGINT handlers', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    const onSpy = jest.spyOn(process, 'on');

    await importDaemonEntry();

    const registeredEvents = onSpy.mock.calls.map(([event]) => event);
    expect(registeredEvents).toContain('SIGTERM');
    expect(registeredEvents).toContain('SIGINT');
  });

  it('triggers shutdown when SIGTERM handler is called', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);

    const onSpy = jest.spyOn(process, 'on');

    await importDaemonEntry();

    const sigTermCall = onSpy.mock.calls.find(([event]) => event === 'SIGTERM');
    const sigTermHandler = sigTermCall?.[1] as () => void;
    sigTermHandler();

    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => process.nextTick(resolve));
    }

    expect(handle.close).toHaveBeenCalled();
    expect(result.dispose).toHaveBeenCalled();
  });

  it('triggers shutdown when SIGINT handler is called', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);

    const onSpy = jest.spyOn(process, 'on');

    await importDaemonEntry();

    const sigIntCall = onSpy.mock.calls.find(([event]) => event === 'SIGINT');
    const sigIntHandler = sigIntCall?.[1] as () => void;
    sigIntHandler();

    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => process.nextTick(resolve));
    }

    expect(handle.close).toHaveBeenCalled();
    expect(result.dispose).toHaveBeenCalled();
  });

  it('shutdown still disposes the wallet when handle.close fails', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    const handle = createMockHandle();
    (handle.close as jest.Mock).mockRejectedValue(new Error('close failed'));
    mockStartRpcSocketServer.mockResolvedValue(handle);

    await importDaemonEntry();

    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const onShutdown = callArgs.onShutdown as () => Promise<void>;
    await onShutdown();

    expect(result.dispose).toHaveBeenCalled();
    expect(mockAppendFile).toHaveBeenCalledWith(
      '/tmp/daemon.log',
      expect.stringContaining('handle.close() failed'),
    );
  });

  it('logs dispose error during shutdown without aborting cleanup', async () => {
    const result = createMockWallet();
    (result.dispose as jest.Mock).mockRejectedValue(
      new Error('dispose failed'),
    );
    mockCreateWallet.mockResolvedValue(result);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);

    await importDaemonEntry();

    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const onShutdown = callArgs.onShutdown as () => Promise<void>;
    await onShutdown();

    expect(handle.close).toHaveBeenCalled();
    expect(mockAppendFile).toHaveBeenCalledWith(
      '/tmp/daemon.log',
      expect.stringContaining('dispose() failed during shutdown'),
    );
  });

  it('handles rm rejection during shutdown cleanup gracefully', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockImplementation(async () => {
        const lastWrite = mockWriteFile.mock.calls.at(-1)?.[1];
        return typeof lastWrite === 'string' ? lastWrite : '';
      });
    // claimDaemonSlot calls rm on both pidPath and socketPath up front; let
    // those succeed, and reject only the shutdown-time rms so we can verify
    // the failure is logged rather than thrown.
    mockRm
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('rm failed'));

    await importDaemonEntry();

    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const onShutdown = callArgs.onShutdown as () => Promise<void>;

    await onShutdown();

    expect(handle.close).toHaveBeenCalled();
    expect(result.dispose).toHaveBeenCalled();
    expect(mockAppendFile).toHaveBeenCalledWith(
      '/tmp/daemon.log',
      expect.stringContaining('Failed to remove socket file'),
    );
  });

  it('handles rm rejection in error cleanup path gracefully', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockRejectedValue(new Error('server failed'));
    mockRm.mockRejectedValue(new Error('rm failed'));

    await importDaemonEntry();

    expect(process.exitCode).toBe(1);
  });

  it('onShutdown closes the server and disposes the wallet', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);
    // Echo the written PID contents back for ownership check.
    mockReadFile
      .mockRejectedValueOnce(enoent())
      .mockImplementation(async () => {
        const lastWrite = mockWriteFile.mock.calls.at(-1)?.[1];
        return typeof lastWrite === 'string' ? lastWrite : '';
      });

    await importDaemonEntry();

    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const onShutdown = callArgs.onShutdown as () => Promise<void>;

    await onShutdown();

    expect(handle.close).toHaveBeenCalled();
    expect(result.dispose).toHaveBeenCalled();
    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
  });

  it('coalesces concurrent shutdown calls', async () => {
    const result = createMockWallet();
    mockCreateWallet.mockResolvedValue(result);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);

    await importDaemonEntry();

    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const onShutdown = callArgs.onShutdown as () => Promise<void>;

    await Promise.all([onShutdown(), onShutdown()]);

    // The teardown body runs once even though shutdown was invoked twice.
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(result.dispose).toHaveBeenCalledTimes(1);
  });

  describe('call handler', () => {
    /**
     * Import the daemon entry and extract the `call` handler definition from
     * the handlers map, along with the mock wallet for assertions.
     *
     * @returns The call handler definition and mock wallet result.
     */
    async function setupCallHandler(): Promise<{
      callHandler: {
        paramsStruct: import('@metamask/superstruct').Struct<
          [string, ...unknown[]]
        >;
        run: (params: [string, ...unknown[]]) => Promise<unknown>;
      };
      result: MockCreateWalletResult;
    }> {
      const result = createMockWallet();
      mockCreateWallet.mockResolvedValue(result);
      mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

      await importDaemonEntry();

      const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
      const callHandler = callArgs.handlers.call as unknown as {
        paramsStruct: import('@metamask/superstruct').Struct<
          [string, ...unknown[]]
        >;
        run: (params: [string, ...unknown[]]) => Promise<unknown>;
      };
      return { callHandler, result };
    }

    it('registers a call handler definition', async () => {
      mockCreateWallet.mockResolvedValue(createMockWallet());
      mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

      await importDaemonEntry();

      const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
      const callDefinition = callArgs.handlers.call;
      expect(callDefinition).toHaveProperty('paramsStruct');
      expect(typeof callDefinition.run).toBe('function');
    });

    it('forwards action and args to messenger.call', async () => {
      const { callHandler, result } = await setupCallHandler();
      const mockCall = result.wallet.messenger.call as jest.Mock;
      mockCall.mockReturnValue({ accounts: [] });

      const callResult = await callHandler.run([
        'Controller:action',
        'arg1',
        'arg2',
      ]);

      expect(mockCall).toHaveBeenCalledWith(
        'Controller:action',
        'arg1',
        'arg2',
      );
      expect(callResult).toStrictEqual({ accounts: [] });
    });

    it('calls messenger.call with no extra args when only action is provided', async () => {
      const { callHandler, result } = await setupCallHandler();
      const mockCall = result.wallet.messenger.call as jest.Mock;
      mockCall.mockReturnValue('ok');

      await callHandler.run(['Controller:action']);

      expect(mockCall).toHaveBeenCalledWith('Controller:action');
    });

    it('awaits async messenger.call results', async () => {
      const { callHandler, result } = await setupCallHandler();
      const mockCall = result.wallet.messenger.call as jest.Mock;
      mockCall.mockResolvedValue({ async: true });

      const callResult = await callHandler.run(['Controller:asyncAction']);

      expect(callResult).toStrictEqual({ async: true });
    });

    it('propagates errors thrown by messenger.call', async () => {
      const { callHandler, result } = await setupCallHandler();
      const mockCall = result.wallet.messenger.call as jest.Mock;
      mockCall.mockImplementation(() => {
        throw new Error('A handler for Unknown:action has not been registered');
      });

      await expect(callHandler.run(['Unknown:action'])).rejects.toThrow(
        'A handler for Unknown:action has not been registered',
      );
    });

    it.each([
      ['null', null],
      ['empty array', []],
      ['non-string first element', [42]],
      ['non-array', { foo: 'bar' }],
    ])('paramsStruct rejects invalid params (%s)', async (_label, value) => {
      const { callHandler } = await setupCallHandler();
      const [error] = validate(value, callHandler.paramsStruct);
      expect(error).toBeDefined();
    });

    it('paramsStruct accepts a non-empty array starting with a string', async () => {
      const { callHandler } = await setupCallHandler();
      const [error] = validate(
        ['Controller:action', 1, 'two'],
        callHandler.paramsStruct,
      );
      expect(error).toBeUndefined();
    });
  });
});
