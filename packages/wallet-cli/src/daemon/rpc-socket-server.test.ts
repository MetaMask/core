import { any, literal } from '@metamask/superstruct';
import { EventEmitter } from 'node:events';
import { chmod, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';

import { startRpcSocketServer } from './rpc-socket-server.js';
import type { RpcHandlerDefinition, RpcHandlerMap } from './types.js';

// any() paramsStruct so the struct guard never rejects test inputs.
function asHandler(run: jest.Mock): RpcHandlerDefinition<unknown, never> {
  return {
    paramsStruct: any(),
    run: run as unknown as RpcHandlerDefinition<unknown, never>['run'],
  };
}

jest.mock('node:fs/promises');
jest.mock('node:net');

const mockUnlink = jest.mocked(unlink);
const mockChmod = jest.mocked(chmod);
const mockCreateServer = jest.mocked(createServer);

type ConnectionCallback = (socket: Socket) => void;

/**
 * Flush pending microtasks/promises by awaiting multiple ticks.
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => process.nextTick(resolve));
  }
}

/**
 * Create a mock net.Server.
 *
 * @returns The mock server and a function to simulate incoming connections.
 */
function createMockServer(): {
  server: Server;
  simulateConnection: (socket: Socket) => void;
} {
  const emitter = new EventEmitter();
  let connectionCallback: ConnectionCallback | undefined;

  const server = Object.assign(emitter, {
    listen: jest.fn((_path: string, onListening: () => void) => {
      onListening();
    }),
    close: jest.fn((onClose: (closeError?: Error) => void) => {
      onClose();
    }),
    removeListener: emitter.removeListener.bind(emitter),
  }) as unknown as Server;

  mockCreateServer.mockImplementation((handler: unknown) => {
    connectionCallback = handler as ConnectionCallback;
    return server;
  });

  return {
    server,
    simulateConnection: (socket: Socket): void => {
      connectionCallback?.(socket);
    },
  };
}

/**
 * Create a mock Socket.
 *
 * @returns A mock socket.
 */
function createMockSocket(): Socket {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    end: jest.fn(),
    destroy: jest.fn(),
    write: jest.fn(),
    removeListener: emitter.removeListener.bind(emitter),
  }) as unknown as Socket;
}

/**
 * Parse the JSON-RPC response written to socket.end().
 *
 * @param socket - The mock socket.
 * @returns The parsed response.
 */
function getResponse(socket: Socket): Record<string, unknown> {
  const endCall = (socket.end as jest.Mock).mock.calls[0][0] as string;
  return JSON.parse(endCall.trim()) as Record<string, unknown>;
}

/**
 * Send a JSON-RPC request to a mock socket by emitting data.
 *
 * @param socket - The mock socket.
 * @param request - The request object.
 */
function sendRequest(socket: Socket, request: Record<string, unknown>): void {
  socket.emit('data', Buffer.from(`${JSON.stringify(request)}\n`));
}

describe('startRpcSocketServer', () => {
  beforeEach(() => {
    mockUnlink.mockResolvedValue(undefined);
    mockChmod.mockResolvedValue(undefined);
  });

  it('removes stale socket file before listening', async () => {
    createMockServer();
    await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/test.sock');
  });

  it('restricts the socket to its owner after listening', async () => {
    createMockServer();
    await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });
    expect(mockChmod).toHaveBeenCalledWith('/tmp/test.sock', 0o600);
  });

  it('tears down the listener and removes the socket when chmod fails', async () => {
    const { server } = createMockServer();
    mockChmod.mockRejectedValue(
      Object.assign(new Error('EPERM'), { code: 'EPERM' }),
    );

    await expect(
      startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      }),
    ).rejects.toThrow('EPERM');

    expect(server.close).toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenLastCalledWith('/tmp/test.sock');
  });

  it('surfaces the chmod failure even if cleanup also fails', async () => {
    const { server } = createMockServer();
    mockChmod.mockRejectedValue(
      Object.assign(new Error('EPERM'), { code: 'EPERM' }),
    );
    (server.close as jest.Mock).mockImplementation(
      (onClose: (closeError?: Error) => void) => {
        onClose(new Error('close failed'));
      },
    );
    mockUnlink
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

    await expect(
      startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      }),
    ).rejects.toThrow('EPERM');
  });

  it('ignores ENOENT unlink errors for missing files', async () => {
    mockUnlink.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    createMockServer();

    const handle = await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });
    expect(handle).toBeDefined();
  });

  it('propagates non-ENOENT unlink errors', async () => {
    mockUnlink.mockRejectedValue(
      Object.assign(new Error('EACCES'), { code: 'EACCES' }),
    );
    createMockServer();

    await expect(
      startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      }),
    ).rejects.toThrow('EACCES');
  });

  it('returns a handle with close()', async () => {
    const { server } = createMockServer();
    const handle = await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });

    await handle.close();
    expect(server.close).toHaveBeenCalled();
  });

  it('rejects close() when server.close errors', async () => {
    createMockServer();
    const handle = await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });

    const { server } = createMockServer();
    (server.close as jest.Mock).mockImplementation(
      (onClose: (closeError?: Error) => void) => {
        onClose(new Error('close failed'));
      },
    );

    const handle2 = await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });
    await expect(handle2.close()).rejects.toThrow('close failed');
    await handle.close();
  });

  describe('request handling', () => {
    it('dispatches valid request to handler and returns result', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        getStatus: asHandler(jest.fn().mockResolvedValue({ status: 'ok' })),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, {
        jsonrpc: '2.0',
        id: '1',
        method: 'getStatus',
      });

      await flushPromises();

      expect(getResponse(socket)).toStrictEqual({
        jsonrpc: '2.0',
        id: '1',
        result: { status: 'ok' },
      });
    });

    it('returns null result when handler returns undefined', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        noop: asHandler(jest.fn().mockResolvedValue(undefined)),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'noop' });

      await flushPromises();

      expect(getResponse(socket).result).toBeNull();
    });

    it('returns -32600 for missing method', async () => {
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1' });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual(
        expect.objectContaining({
          code: -32600,
          message: 'Invalid JSON-RPC request',
        }),
      );
    });

    it('returns -32600 for a request whose id is an object', async () => {
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, {
        jsonrpc: '2.0',
        id: { nested: 'bad' },
        method: 'getStatus',
      });

      await flushPromises();

      const response = getResponse(socket);
      // Per JSON-RPC 2.0, id must be string/number/null. We cannot echo the
      // object back, so respond with id: null.
      expect(response.id).toBeNull();
      expect(response.error).toStrictEqual(
        expect.objectContaining({ code: -32600 }),
      );
    });

    it('returns -32601 for unknown method', async () => {
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, {
        jsonrpc: '2.0',
        id: '1',
        method: 'nonexistent',
      });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual(
        expect.objectContaining({
          code: -32601,
          message: 'Method not found: nonexistent',
        }),
      );
    });

    it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
      'returns -32601 for the Object.prototype name %p instead of invoking the inherited member',
      async (method) => {
        const { simulateConnection } = createMockServer();
        await startRpcSocketServer({
          socketPath: '/tmp/test.sock',
          handlers: {},
        });

        const socket = createMockSocket();
        simulateConnection(socket);
        sendRequest(socket, { jsonrpc: '2.0', id: '1', method });

        await flushPromises();

        expect(getResponse(socket).error).toStrictEqual(
          expect.objectContaining({
            code: -32601,
          }),
        );
      },
    );

    it('returns -32603 when handler throws an Error', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        failing: asHandler(
          jest.fn().mockRejectedValue(new Error('handler failed')),
        ),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'failing' });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual(
        expect.objectContaining({
          code: -32603,
          message: 'handler failed',
        }),
      );
    });

    it('passes through RPC error objects when handler throws one', async () => {
      const { simulateConnection } = createMockServer();
      const rpcError = { code: -32001, message: 'custom rpc' };
      const handlers: RpcHandlerMap = {
        failing: asHandler(jest.fn().mockRejectedValue(rpcError)),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'failing' });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual({
        code: -32001,
        message: 'custom rpc',
      });
    });

    it('returns Internal error when handler throws a non-Error value', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        failing: asHandler(jest.fn().mockRejectedValue('string error')),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'failing' });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual(
        expect.objectContaining({
          code: -32603,
          message: 'Internal error',
        }),
      );
    });

    it('intercepts shutdown method and calls onShutdown', async () => {
      jest.useFakeTimers();
      const { simulateConnection } = createMockServer();
      const onShutdown = jest.fn().mockResolvedValue(undefined);

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
        onShutdown,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'shutdown' });

      await jest.advanceTimersByTimeAsync(0);

      expect(getResponse(socket).result).toStrictEqual({
        status: 'shutting down',
      });
      expect(onShutdown).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('handles onShutdown rejection and logs to stderr', async () => {
      jest.useFakeTimers();
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const { simulateConnection } = createMockServer();
      const onShutdown = jest.fn().mockRejectedValue(new Error('shutdown err'));

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
        onShutdown,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'shutdown' });

      await jest.advanceTimersByTimeAsync(0);

      expect(getResponse(socket).result).toStrictEqual({
        status: 'shutting down',
      });
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('onShutdown callback failed'),
      );
      jest.useRealTimers();
      stderrSpy.mockRestore();
    });

    it('responds to shutdown even without onShutdown callback', async () => {
      const { simulateConnection } = createMockServer();

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'shutdown' });

      await flushPromises();

      expect(getResponse(socket).result).toStrictEqual({
        status: 'shutting down',
      });
    });

    it('rejects multiple requests per connection', async () => {
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);

      socket.emit(
        'data',
        Buffer.from(
          `${JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'a' })}\nextra`,
        ),
      );

      const response = getResponse(socket);
      expect(response.error).toStrictEqual(
        expect.objectContaining({
          code: -32600,
          message: 'Only one request per connection is allowed',
        }),
      );
    });

    it('accumulates partial data across multiple events', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        test: asHandler(jest.fn().mockResolvedValue('ok')),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);

      const full = JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
      });
      socket.emit('data', Buffer.from(full.slice(0, 10)));
      socket.emit('data', Buffer.from(`${full.slice(10)}\n`));

      await flushPromises();

      expect(getResponse(socket).result).toBe('ok');
    });

    it('silently ignores EPIPE and ECONNRESET socket errors', async () => {
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);

      socket.emit(
        'error',
        Object.assign(new Error('broken pipe'), { code: 'EPIPE' }),
      );
      socket.emit(
        'error',
        Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
      );

      expect(stderrSpy).not.toHaveBeenCalled();
      stderrSpy.mockRestore();
    });

    it('logs unexpected socket errors to stderr', async () => {
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);

      socket.emit(
        'error',
        Object.assign(new Error('unexpected'), { code: 'ENOMEM' }),
      );

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected socket error'),
      );
      stderrSpy.mockRestore();
    });

    it('sends internal error when response serialization fails', async () => {
      const { simulateConnection } = createMockServer();
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const handlers: RpcHandlerMap = {
        bad: asHandler(jest.fn().mockResolvedValue(circular)),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'bad' });

      await flushPromises();

      const endCall = (socket.end as jest.Mock).mock.calls[0][0] as string;
      const response = JSON.parse(endCall.trim()) as Record<string, unknown>;
      expect(response.error).toBeDefined();
    });

    it('handles invalid JSON gracefully', async () => {
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      socket.emit('data', Buffer.from('not-json\n'));

      await flushPromises();

      expect((getResponse(socket).error as { code: number }).code).toBe(-32700);
    });

    it('uses null id when request has no id', async () => {
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', method: 'unknown' });

      await flushPromises();

      expect(getResponse(socket).id).toBeNull();
    });

    it('destroys socket when no complete request arrives within timeout', async () => {
      jest.useFakeTimers();
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);

      socket.emit('data', Buffer.from('partial'));

      expect(socket.destroy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(30_000);

      expect(socket.destroy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('returns -32602 when params fail the registered struct', async () => {
      const { simulateConnection } = createMockServer();
      const run = jest.fn();
      const handlers: RpcHandlerMap = {
        strict: {
          paramsStruct: literal('expected'),
          run: run as unknown as RpcHandlerMap[string]['run'],
        },
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, {
        jsonrpc: '2.0',
        id: '1',
        method: 'strict',
        params: ['something else'],
      });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual(
        expect.objectContaining({
          code: -32602,
          message: expect.stringContaining('Invalid params for strict'),
        }),
      );
      expect(run).not.toHaveBeenCalled();
    });

    it('returns -32602 when params are absent and struct rejects null', async () => {
      const { simulateConnection } = createMockServer();
      const run = jest.fn();
      const handlers: RpcHandlerMap = {
        strict: {
          paramsStruct: literal('expected'),
          run: run as unknown as RpcHandlerMap[string]['run'],
        },
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'strict' });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual(
        expect.objectContaining({
          code: -32602,
          message: expect.stringContaining('Invalid params for strict'),
        }),
      );
      expect(run).not.toHaveBeenCalled();
    });

    it('logs the method name when a handler throws', async () => {
      const { simulateConnection } = createMockServer();
      const log = jest.fn();
      const handlers: RpcHandlerMap = {
        failing: asHandler(
          jest.fn().mockRejectedValue(new Error('handler failed')),
        ),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
        log,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'failing' });

      await flushPromises();

      expect(log).toHaveBeenCalledWith(expect.stringContaining('failing'));
    });

    it('wraps thrown object with code but no message as internal error', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        failing: asHandler(jest.fn().mockRejectedValue({ code: 42 })),
      };

      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers,
      });

      const socket = createMockSocket();
      simulateConnection(socket);
      sendRequest(socket, { jsonrpc: '2.0', id: '1', method: 'failing' });

      await flushPromises();

      expect(getResponse(socket).error).toStrictEqual(
        expect.objectContaining({
          code: -32603,
          message: 'Internal error',
        }),
      );
    });
  });
});
