import { appendFileSync, mkdirSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';

import { getDaemonPaths } from './paths';
import { startRpcSocketServer } from './rpc-socket-server';
import type { RpcSocketServerHandle } from './rpc-socket-server';
import { createWallet } from './wallet-factory';

jest.mock('node:fs');
jest.mock('node:fs/promises');
jest.mock('./paths');
jest.mock('./rpc-socket-server');
jest.mock('./wallet-factory');

const mockMkdirSync = jest.mocked(mkdirSync);
const mockAppendFileSync = jest.mocked(appendFileSync);
const mockWriteFile = jest.mocked(writeFile);
const mockRm = jest.mocked(rm);
const mockGetDaemonPaths = jest.mocked(getDaemonPaths);
const mockStartRpcSocketServer = jest.mocked(startRpcSocketServer);
const mockCreateWallet = jest.mocked(createWallet);

// The module under test calls main() at top level on import.
// We use jest.isolateModules to re-import it fresh in each test
// after setting up mocks and env vars.

const ORIGINAL_ENV = process.env;

/**
 * Create a mock wallet.
 *
 * @returns A mock wallet object.
 */
function createMockWallet(): Awaited<ReturnType<typeof createWallet>> {
  return {
    messenger: { call: jest.fn() } as never,
    state: {} as never,
    destroy: jest.fn().mockResolvedValue(undefined),
  } as unknown as Awaited<ReturnType<typeof createWallet>>;
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
      'test test test test test test test test test test test ball';
    process.exitCode = undefined;
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    mockGetDaemonPaths.mockReturnValue({
      socketPath: '/tmp/daemon.sock',
      pidPath: '/tmp/daemon.pid',
      logPath: '/tmp/daemon.log',
    });
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
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
      // Flush microtasks so main()'s .catch() handler settles
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

  it('creates data dir, wallet, server, and writes PID on successful startup', async () => {
    const wallet = createMockWallet();
    mockCreateWallet.mockResolvedValue(wallet);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);

    await importDaemonEntry();

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/data', {
      recursive: true,
    });
    expect(mockCreateWallet).toHaveBeenCalledWith({
      infuraProjectId: 'key',
      password: 'pass',
      srp: 'test test test test test test test test test test test ball',
    });
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/daemon.pid',
      String(process.pid),
    );
    expect(mockStartRpcSocketServer).toHaveBeenCalledWith(
      expect.objectContaining({
        socketPath: '/tmp/daemon.sock',
      }),
    );
    expect(process.exitCode).toBeUndefined();
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

  it('cleans up wallet and PID file when server fails to start', async () => {
    const wallet = createMockWallet();
    mockCreateWallet.mockResolvedValue(wallet);
    mockStartRpcSocketServer.mockRejectedValue(new Error('server failed'));

    await importDaemonEntry();

    expect(wallet.destroy).toHaveBeenCalled();
    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
    expect(process.exitCode).toBe(1);
  });

  it('still cleans up PID when wallet.destroy fails during error cleanup', async () => {
    const wallet = createMockWallet();
    (wallet.destroy as jest.Mock).mockRejectedValue(
      new Error('destroy failed'),
    );
    mockCreateWallet.mockResolvedValue(wallet);
    mockStartRpcSocketServer.mockRejectedValue(new Error('server failed'));

    await importDaemonEntry();

    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
    expect(process.exitCode).toBe(1);
  });

  it('exposes getStatus handler that returns pid and uptime', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    // Extract the handlers passed to startRpcSocketServer
    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const { handlers } = callArgs;
    const status = (await handlers.getStatus(null)) as {
      pid: number;
      uptime: number;
    };

    expect(status.pid).toBe(process.pid);
    expect(typeof status.uptime).toBe('number');
  });

  it('logs to file via makeLogger', async () => {
    mockCreateWallet.mockResolvedValue(createMockWallet());
    mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

    await importDaemonEntry();

    // makeLogger writes via appendFileSync to the log path
    expect(mockAppendFileSync).toHaveBeenCalledWith(
      '/tmp/daemon.log',
      expect.stringContaining('Starting daemon...'),
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

  it('sIGTERM handler calls shutdown and sets exitCode on failure', async () => {
    const wallet = createMockWallet();
    mockCreateWallet.mockResolvedValue(wallet);
    const handle = createMockHandle();
    (handle.close as jest.Mock).mockRejectedValue(new Error('close failed'));
    mockStartRpcSocketServer.mockResolvedValue(handle);

    const onSpy = jest.spyOn(process, 'on');

    await importDaemonEntry();

    // Find the SIGTERM handler and invoke it
    const sigTermCall = onSpy.mock.calls.find(([event]) => event === 'SIGTERM');
    const sigTermHandler = sigTermCall?.[1] as () => void;
    sigTermHandler();

    // Flush promise chain
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => process.nextTick(resolve));
    }

    expect(process.exitCode).toBe(1);
  });

  it('sIGINT handler calls shutdown and sets exitCode on failure', async () => {
    const wallet = createMockWallet();
    mockCreateWallet.mockResolvedValue(wallet);
    const handle = createMockHandle();
    (handle.close as jest.Mock).mockRejectedValue(new Error('close failed'));
    mockStartRpcSocketServer.mockResolvedValue(handle);

    const onSpy = jest.spyOn(process, 'on');

    await importDaemonEntry();

    const sigIntCall = onSpy.mock.calls.find(([event]) => event === 'SIGINT');
    const sigIntHandler = sigIntCall?.[1] as () => void;
    sigIntHandler();

    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => process.nextTick(resolve));
    }

    expect(process.exitCode).toBe(1);
  });

  it('handles rm rejection during shutdown cleanup gracefully', async () => {
    const wallet = createMockWallet();
    mockCreateWallet.mockResolvedValue(wallet);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);
    // rm rejects but cleanup should not fail
    mockRm.mockRejectedValue(new Error('rm failed'));

    await importDaemonEntry();

    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const onShutdown = callArgs.onShutdown as () => Promise<void>;

    await onShutdown();

    expect(handle.close).toHaveBeenCalled();
    expect(wallet.destroy).toHaveBeenCalled();
  });

  it('handles rm rejection in error cleanup path gracefully', async () => {
    const wallet = createMockWallet();
    mockCreateWallet.mockResolvedValue(wallet);
    mockStartRpcSocketServer.mockRejectedValue(new Error('server failed'));
    mockRm.mockRejectedValue(new Error('rm failed'));

    await importDaemonEntry();

    expect(process.exitCode).toBe(1);
  });

  it('onShutdown closes server and destroys wallet', async () => {
    const wallet = createMockWallet();
    mockCreateWallet.mockResolvedValue(wallet);
    const handle = createMockHandle();
    mockStartRpcSocketServer.mockResolvedValue(handle);

    await importDaemonEntry();

    // Extract the onShutdown callback
    const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
    const onShutdown = callArgs.onShutdown as () => Promise<void>;

    await onShutdown();

    expect(handle.close).toHaveBeenCalled();
    expect(wallet.destroy).toHaveBeenCalled();
    expect(mockRm).toHaveBeenCalledWith('/tmp/daemon.pid', { force: true });
  });

  describe('call handler', () => {
    /**
     * Import the daemon entry and extract the `call` handler from the
     * handlers map, along with the mock wallet for assertions.
     *
     * @returns The call handler function and mock wallet.
     */
    async function setupCallHandler(): Promise<{
      callHandler: (params: unknown) => Promise<unknown>;
      wallet: Awaited<ReturnType<typeof createWallet>>;
    }> {
      const wallet = createMockWallet();
      mockCreateWallet.mockResolvedValue(wallet);
      mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

      await importDaemonEntry();

      const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
      const callHandler = callArgs.handlers.call as (
        params: unknown,
      ) => Promise<unknown>;
      return { callHandler, wallet };
    }

    it('registers a call handler', async () => {
      mockCreateWallet.mockResolvedValue(createMockWallet());
      mockStartRpcSocketServer.mockResolvedValue(createMockHandle());

      await importDaemonEntry();

      const callArgs = mockStartRpcSocketServer.mock.calls[0][0];
      expect(typeof callArgs.handlers.call).toBe('function');
    });

    it('forwards action and args to messenger.call', async () => {
      const { callHandler, wallet } = await setupCallHandler();
      const mockCall = wallet.messenger.call as jest.Mock;
      mockCall.mockReturnValue({ accounts: [] });

      const result = await callHandler(['Controller:action', 'arg1', 'arg2']);

      expect(mockCall).toHaveBeenCalledWith(
        'Controller:action',
        'arg1',
        'arg2',
      );
      expect(result).toStrictEqual({ accounts: [] });
    });

    it('calls messenger.call with no extra args when only action is provided', async () => {
      const { callHandler, wallet } = await setupCallHandler();
      const mockCall = wallet.messenger.call as jest.Mock;
      mockCall.mockReturnValue('ok');

      await callHandler(['Controller:action']);

      expect(mockCall).toHaveBeenCalledWith('Controller:action');
    });

    it('awaits async messenger.call results', async () => {
      const { callHandler, wallet } = await setupCallHandler();
      const mockCall = wallet.messenger.call as jest.Mock;
      mockCall.mockResolvedValue({ async: true });

      const result = await callHandler(['Controller:asyncAction']);

      expect(result).toStrictEqual({ async: true });
    });

    it('propagates errors thrown by messenger.call', async () => {
      const { callHandler, wallet } = await setupCallHandler();
      const mockCall = wallet.messenger.call as jest.Mock;
      mockCall.mockImplementation(() => {
        throw new Error('A handler for Unknown:action has not been registered');
      });

      await expect(callHandler(['Unknown:action'])).rejects.toThrow(
        'A handler for Unknown:action has not been registered',
      );
    });

    it('throws when params is null', async () => {
      const { callHandler } = await setupCallHandler();

      await expect(callHandler(null)).rejects.toThrow(
        'Expected params to be an array with an action name',
      );
    });

    it('throws when params is an empty array', async () => {
      const { callHandler } = await setupCallHandler();

      await expect(callHandler([])).rejects.toThrow(
        'Expected params to be an array with an action name',
      );
    });

    it('throws when action name is not a string', async () => {
      const { callHandler } = await setupCallHandler();

      await expect(callHandler([42])).rejects.toThrow(
        'Expected params to be an array with an action name',
      );
    });
  });
});
