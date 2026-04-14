import { rpcErrors } from '@metamask/rpc-errors';
import { hasProperty } from '@metamask/utils';
import { unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:net';

import type { RpcHandlerMap } from './types';

/**
 * Handle returned by {@link startRpcSocketServer}.
 */
export type RpcSocketServerHandle = {
  close: () => Promise<void>;
};

/**
 * Start a Unix socket server that processes JSON-RPC requests.
 *
 * Each connection reads one newline-delimited JSON-RPC request, processes it
 * via the provided handler map, writes a JSON-RPC response, and closes.
 *
 * The special `shutdown` method is intercepted before handler dispatch and
 * triggers the provided {@link onShutdown} callback after responding.
 *
 * @param options - Server options.
 * @param options.socketPath - The Unix socket path to listen on.
 * @param options.handlers - Map of RPC method names to handler functions.
 * @param options.onShutdown - Callback invoked when a `shutdown` RPC is received.
 * @returns A handle with a `close()` function for cleanup.
 */
export async function startRpcSocketServer({
  socketPath,
  handlers,
  onShutdown,
}: {
  socketPath: string;
  handlers: RpcHandlerMap;
  onShutdown?: (() => Promise<void>) | undefined;
}): Promise<RpcSocketServerHandle> {
  const server = createServer((socket) => {
    let buffer = '';

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx === -1) {
        return;
      }

      // One request per connection.
      socket.removeListener('data', onData);

      const line = buffer.slice(0, idx);
      const remaining = buffer.slice(idx + 1);
      buffer = '';

      if (remaining.length > 0) {
        socket.end(
          `${JSON.stringify({
            jsonrpc: '2.0',
            error: rpcErrors.invalidRequest({
              message: 'Only one request per connection is allowed',
            }),
          })}\n`,
        );
        return;
      }

      handleRequest(handlers, line, onShutdown)
        .then((response) => {
          socket.end(`${JSON.stringify(response)}\n`);
          return undefined;
        })
        .catch(() => {
          socket.end(
            `${JSON.stringify({
              jsonrpc: '2.0',
              error: rpcErrors.internal({ message: 'Internal error' }),
            })}\n`,
          );
        });
    };
    socket.on('data', onData);

    socket.on('error', () => {
      // Ignore client socket errors (e.g. broken pipe from probe connections).
    });
  });

  await listen(server, socketPath);

  return {
    close: async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

/**
 * Handle a single JSON-RPC request line, intercepting the `shutdown` method.
 *
 * @param handlers - The RPC handler map.
 * @param line - The raw JSON line from the socket.
 * @param onShutdown - Optional shutdown callback.
 * @returns A JSON-RPC response object.
 */
async function handleRequest(
  handlers: RpcHandlerMap,
  line: string,
  onShutdown?: () => Promise<void>,
): Promise<Record<string, unknown>> {
  let id: unknown = null;

  try {
    const request = JSON.parse(line) as {
      id?: unknown;
      method?: string;
      params?: unknown;
    };
    id = request.id ?? null;
    const { method } = request;

    if (typeof method !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid request: missing method' },
      };
    }

    // Intercept shutdown before handler dispatch.
    if (method === 'shutdown') {
      if (onShutdown) {
        setTimeout(() => {
          onShutdown().catch(() => {
            // Best-effort shutdown.
          });
        }, 0);
      }
      return { jsonrpc: '2.0', id, result: { status: 'shutting down' } };
    }

    const handler = handlers[method];
    if (!handler) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
    }

    const params = (request.params as Parameters<typeof handler>[0]) ?? null;
    const result = await handler(params);
    return { jsonrpc: '2.0', id, result: result ?? null };
  } catch (error) {
    const code = isRpcError(error) ? error.code : -32603;
    const message = error instanceof Error ? error.message : 'Internal error';
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}

/**
 * Check if an error is an RPC error with a numeric code.
 *
 * @param error - The error to check.
 * @returns True if the error has a numeric code property.
 */
function isRpcError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    hasProperty(error, 'code') &&
    typeof error.code === 'number'
  );
}

/**
 * Start listening on a Unix socket path, removing any stale socket file.
 *
 * @param server - The net.Server instance.
 * @param socketPath - The Unix socket path.
 */
async function listen(server: Server, socketPath: string): Promise<void> {
  try {
    await unlink(socketPath);
  } catch {
    // Ignore — file may not exist.
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}
