import { EventEmitter } from 'node:events';
import { unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';

import { startRpcSocketServer } from './rpc-socket-server';
import type { RpcHandlerMap } from './types';

jest.mock('node:fs/promises');
jest.mock('node:net');

const mockUnlink = jest.mocked(unlink);
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
  });

  it('removes stale socket file before listening', async () => {
    createMockServer();
    await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/test.sock');
  });

  it('ignores unlink errors for missing files', async () => {
    mockUnlink.mockRejectedValue(new Error('ENOENT'));
    createMockServer();

    const handle = await startRpcSocketServer({
      socketPath: '/tmp/test.sock',
      handlers: {},
    });
    expect(handle).toBeDefined();
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
        getStatus: jest.fn().mockResolvedValue({ status: 'ok' }),
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
        noop: jest.fn().mockResolvedValue(undefined),
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
          message: 'Invalid request: missing method',
        }),
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

    it('returns -32603 when handler throws an Error', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        failing: jest.fn().mockRejectedValue(new Error('handler failed')),
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
        failing: jest.fn().mockRejectedValue(rpcError),
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
        failing: jest.fn().mockRejectedValue('string error'),
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

    it('handles onShutdown rejection gracefully', async () => {
      jest.useFakeTimers();
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
      jest.useRealTimers();
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

      // Send a valid request followed by extra data after the newline.
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
        test: jest.fn().mockResolvedValue('ok'),
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

    it('ignores socket errors', async () => {
      const { simulateConnection } = createMockServer();
      await startRpcSocketServer({
        socketPath: '/tmp/test.sock',
        handlers: {},
      });

      const socket = createMockSocket();
      simulateConnection(socket);

      // Should not throw
      expect(() =>
        socket.emit('error', new Error('broken pipe')),
      ).not.toThrow();
    });

    it('sends internal error when response serialization fails', async () => {
      const { simulateConnection } = createMockServer();
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const handlers: RpcHandlerMap = {
        bad: jest.fn().mockResolvedValue(circular),
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

      // Send partial data (no newline).
      socket.emit('data', Buffer.from('partial'));

      expect(socket.destroy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(30_000);

      expect(socket.destroy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('wraps thrown object with code but no message as internal error', async () => {
      const { simulateConnection } = createMockServer();
      const handlers: RpcHandlerMap = {
        failing: jest.fn().mockRejectedValue({ code: 42 }),
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
