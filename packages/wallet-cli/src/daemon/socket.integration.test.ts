import { any } from '@metamask/superstruct';
import { stat } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pingDaemon, sendCommand } from './daemon-client.js';
import { startRpcSocketServer } from './rpc-socket-server.js';
import type { RpcSocketServerHandle } from './rpc-socket-server.js';
import type { RpcHandlerDefinition } from './types.js';

// any() paramsStruct so integration test inputs are never rejected by the struct guard.
function handlerDefinition(
  run: (params: unknown) => Promise<unknown>,
): RpcHandlerDefinition<unknown, never> {
  return {
    paramsStruct: any(),
    run: run as unknown as RpcHandlerDefinition<unknown, never>['run'],
  };
}

/**
 * End-to-end integration tests for the daemon's IPC layer: real
 * `startRpcSocketServer` listening on a real Unix socket, real `sendCommand`
 * speaking newline-delimited JSON-RPC over `net.createConnection`. Every
 * other test in this package mocks one side of this boundary; these tests
 * guard against bugs that only surface when both halves run together
 * (framing, response-id correlation, the "one request per connection"
 * invariant, real shutdown timing).
 */
describe('socket integration', () => {
  const openHandles: RpcSocketServerHandle[] = [];
  let socketPath: string;

  beforeEach(() => {
    socketPath = join(
      tmpdir(),
      `mm-cli-it-${process.pid}-${Date.now()}-${Math.random()}.sock`,
    );
  });

  afterEach(async () => {
    while (openHandles.length > 0) {
      const handle = openHandles.pop();
      await handle?.close().catch(() => undefined);
    }
  });

  /**
   * Start an RPC server, register its handle for afterEach cleanup, and
   * return it. Avoids the `require-atomic-updates` shape lint complains
   * about when assigning to a let-bound variable across awaits.
   *
   * @param options - Options forwarded to `startRpcSocketServer`.
   * @returns The started server's handle.
   */
  async function startServer(
    options: Parameters<typeof startRpcSocketServer>[0],
  ): Promise<RpcSocketServerHandle> {
    const handle = await startRpcSocketServer(options);
    openHandles.push(handle);
    return handle;
  }

  it('round-trips a JSON-RPC request between sendCommand and startRpcSocketServer', async () => {
    await startServer({
      socketPath,
      handlers: {
        getStatus: handlerDefinition(async () => ({ pid: 42, uptime: 7 })),
      },
    });

    const response = await sendCommand({
      socketPath,
      method: 'getStatus',
      timeoutMs: 2_000,
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      result: { pid: 42, uptime: 7 },
    });
  });

  it('restricts the socket file to the owner (0600)', async () => {
    await startServer({
      socketPath,
      handlers: {
        getStatus: handlerDefinition(async () => ({ pid: 1, uptime: 0 })),
      },
    });

    // The daemon hosts an unlocked wallet, so the socket must not be
    // connectable by other local users.
    const stats = await stat(socketPath);
    expect(stats.mode.toString(8).slice(-3)).toBe('600');
  });

  it('returns responsive from pingDaemon when the server is up', async () => {
    await startServer({
      socketPath,
      handlers: {
        getStatus: handlerDefinition(async () => ({ pid: 1, uptime: 0 })),
      },
    });

    expect(await pingDaemon(socketPath)).toStrictEqual({
      status: 'responsive',
    });
  });

  it('returns absent from pingDaemon when no socket exists', async () => {
    expect(await pingDaemon(socketPath)).toStrictEqual({ status: 'absent' });
  });

  it('surfaces handler errors to the client as JSON-RPC errors', async () => {
    await startServer({
      socketPath,
      handlers: {
        boom: handlerDefinition(async () => {
          throw new Error('handler exploded');
        }),
      },
    });

    const response = await sendCommand({
      socketPath,
      method: 'boom',
      timeoutMs: 2_000,
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      error: expect.objectContaining({
        code: -32603,
        message: 'handler exploded',
      }),
    });
  });

  it('returns methodNotFound for unknown methods', async () => {
    await startServer({
      socketPath,
      handlers: {
        getStatus: handlerDefinition(async () => ({ pid: 1, uptime: 0 })),
      },
    });

    const response = await sendCommand({
      socketPath,
      method: 'doesNotExist',
      timeoutMs: 2_000,
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      error: expect.objectContaining({ code: -32601 }),
    });
  });

  it('handles concurrent in-flight requests without bleeding buffers across connections', async () => {
    await startServer({
      socketPath,
      handlers: {
        echo: handlerDefinition(async (params) => ({ params })),
      },
    });

    const responses = await Promise.all(
      Array.from({ length: 8 }, async (_value, index) =>
        sendCommand({
          socketPath,
          method: 'echo',
          params: [`request-${index}`],
          timeoutMs: 2_000,
        }),
      ),
    );

    for (const [index, response] of responses.entries()) {
      expect(response).toMatchObject({
        result: { params: [`request-${index}`] },
      });
    }
  });

  it('intercepts the `shutdown` method and fires the onShutdown callback', async () => {
    const onShutdown = jest.fn().mockResolvedValue(undefined);
    await startServer({
      socketPath,
      handlers: {},
      onShutdown,
    });

    const response = await sendCommand({
      socketPath,
      method: 'shutdown',
      timeoutMs: 2_000,
    });

    expect(response).toMatchObject({
      result: { status: 'shutting down' },
    });

    // onShutdown fires via setTimeout(..., 0) after the response is written.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  it('rejects pipelined requests with an invalidRequest error', async () => {
    await startServer({
      socketPath,
      handlers: {
        getStatus: handlerDefinition(async () => ({ pid: 1, uptime: 0 })),
      },
    });

    // Open a raw connection and write two requests at once.
    const socket = createConnection(socketPath);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
    });

    socket.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'getStatus' })}\n` +
        `${JSON.stringify({ jsonrpc: '2.0', id: '2', method: 'getStatus' })}\n`,
    );

    const responseLine = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      const onData = (chunk: Buffer): void => {
        buffer += chunk.toString();
        const idx = buffer.indexOf('\n');
        if (idx !== -1) {
          socket.removeListener('data', onData);
          resolve(buffer.slice(0, idx));
        }
      };
      socket.on('data', onData);
      socket.once('error', reject);
    });
    socket.destroy();

    const response: unknown = JSON.parse(responseLine);
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      error: expect.objectContaining({ code: -32600 }),
    });
  });
});
