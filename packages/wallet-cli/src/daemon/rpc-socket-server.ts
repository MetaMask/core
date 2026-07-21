import { rpcErrors } from '@metamask/rpc-errors';
import { validate as validateStruct } from '@metamask/superstruct';
import type {
  JsonRpcId,
  JsonRpcParams,
  JsonRpcResponse,
} from '@metamask/utils';
import { hasProperty, isJsonRpcRequest } from '@metamask/utils';
import { chmod, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:net';

import type { RpcHandlerMap } from './types';
import { isErrorWithCode } from './utils';

const CONNECTION_TIMEOUT_MS = 30_000;

/**
 * Handle returned by {@link startRpcSocketServer}.
 */
export type RpcSocketServerHandle = {
  close: () => Promise<void>;
};

/**
 * Options for {@link startRpcSocketServer}.
 */
export type StartRpcSocketServerOptions = {
  /** The Unix socket path to listen on. */
  socketPath: string;
  /** Map of RPC method names to handler functions. */
  handlers: RpcHandlerMap;
  /** Callback invoked when a `shutdown` RPC is received. */
  onShutdown?: (() => Promise<void>) | undefined;
  /**
   * Optional logger for server-side diagnostics (unexpected socket errors,
   * unhandled handler rejections, `onShutdown` callback failures). Without
   * this, failures fall back to `process.stderr.write`, which is discarded
   * when the daemon is spawned with `stdio: 'ignore'`.
   */
  log?: ((message: string) => void) | undefined;
};

/**
 * Start a Unix socket server that processes JSON-RPC requests.
 *
 * Each connection reads one newline-delimited JSON-RPC request, processes it
 * via the provided handler map, writes a JSON-RPC response, and closes.
 *
 * The special `shutdown` method is intercepted before handler dispatch and
 * triggers the provided {@link StartRpcSocketServerOptions.onShutdown} callback
 * after responding.
 *
 * @param options - Server options.
 * @param options.socketPath - The Unix socket path to listen on.
 * @param options.handlers - Map of RPC method names to handler functions.
 * @param options.onShutdown - Optional callback invoked when a `shutdown` RPC is received.
 * @param options.log - Optional logger for server-side diagnostics.
 * @returns A handle with a `close()` function for cleanup.
 */
export async function startRpcSocketServer({
  socketPath,
  handlers,
  onShutdown,
  log,
}: StartRpcSocketServerOptions): Promise<RpcSocketServerHandle> {
  const logFn = log ?? defaultLog;

  const server = createServer((socket) => {
    let buffer = '';

    // Destroy connections that never send a complete request line. `unref` so
    // the timer alone cannot keep the event loop alive at shutdown.
    const timer = setTimeout(() => {
      socket.destroy();
    }, CONNECTION_TIMEOUT_MS);
    timer.unref();

    /**
     * Clear the idle-connection timer. Called from data, close, and error
     * paths so the timer never outlives the connection itself.
     */
    const clearIdleTimer = (): void => {
      clearTimeout(timer);
    };

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx === -1) {
        return;
      }

      clearIdleTimer();

      // One request per connection.
      socket.removeListener('data', onData);

      const line = buffer.slice(0, idx);
      const remaining = buffer.slice(idx + 1);
      buffer = '';

      if (remaining.length > 0) {
        socket.end(
          `${JSON.stringify({
            jsonrpc: '2.0',
            error: rpcErrors
              .invalidRequest({
                message: 'Only one request per connection is allowed',
              })
              .serialize(),
          })}\n`,
        );
        return;
      }

      handleRequest(handlers, line, onShutdown, logFn)
        .then((response) => {
          socket.end(`${JSON.stringify(response)}\n`);
          return undefined;
        })
        .catch((dispatchError: unknown) => {
          logFn(`Unhandled RPC dispatch error: ${String(dispatchError)}`);
          socket.end(
            `${JSON.stringify({
              jsonrpc: '2.0',
              error: rpcErrors
                .internal({ message: 'Internal error' })
                .serialize(),
            })}\n`,
          );
        });
    };
    socket.on('data', onData);
    socket.once('close', clearIdleTimer);
    socket.on('error', (socketError: NodeJS.ErrnoException) => {
      clearIdleTimer();
      const { code } = socketError;
      if (code === 'EPIPE' || code === 'ECONNRESET') {
        return; // Expected during probe/disconnect.
      }
      logFn(`Unexpected socket error: ${String(socketError)}`);
    });
  });

  await listen(server, socketPath);

  return {
    close: async (): Promise<void> => closeServer(server),
  };
}

/**
 * Default fallback logger: writes to stderr. Daemons spawned with
 * `stdio: 'ignore'` should always pass an explicit `log`.
 *
 * @param message - The message to log.
 */
function defaultLog(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Handle a single JSON-RPC request line, intercepting the `shutdown` method.
 *
 * @param handlers - The RPC handler map.
 * @param line - The raw JSON line from the socket.
 * @param onShutdown - Optional shutdown callback.
 * @param log - Logger for diagnostic messages.
 * @returns A JSON-RPC response object.
 */
async function handleRequest(
  handlers: RpcHandlerMap,
  line: string,
  onShutdown: (() => Promise<void>) | undefined,
  log: (message: string) => void,
): Promise<JsonRpcResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return {
      jsonrpc: '2.0',
      id: null,
      error: rpcErrors.parse({ message: 'Parse error' }).serialize(),
    };
  }

  if (!isJsonRpcRequest(parsed)) {
    const id: JsonRpcId =
      typeof parsed === 'object' &&
      parsed !== null &&
      hasProperty(parsed, 'id') &&
      isValidJsonRpcId(parsed.id)
        ? parsed.id
        : null;
    return {
      jsonrpc: '2.0',
      id,
      error: rpcErrors
        .invalidRequest({ message: 'Invalid JSON-RPC request' })
        .serialize(),
    };
  }

  const { id, method, params } = parsed;

  try {
    if (method === 'shutdown') {
      if (onShutdown) {
        setTimeout(() => {
          onShutdown().catch((error: unknown) => {
            log(`onShutdown callback failed: ${String(error)}`);
          });
        }, 0);
      }
      return { jsonrpc: '2.0', id, result: { status: 'shutting down' } };
    }

    const handler = Object.prototype.hasOwnProperty.call(handlers, method)
      ? handlers[method]
      : undefined;
    if (!handler) {
      return {
        jsonrpc: '2.0',
        id,
        error: rpcErrors
          .methodNotFound({ message: `Method not found: ${method}` })
          .serialize(),
      };
    }

    const [structError, validatedParams] = validateStruct(
      coerceHandlerParams(params),
      handler.paramsStruct,
    );
    if (structError !== undefined) {
      return {
        jsonrpc: '2.0',
        id,
        error: rpcErrors
          .invalidParams({
            message: `Invalid params for ${method}: ${structError.message}`,
          })
          .serialize(),
      };
    }

    const result = await handler.run(validatedParams);
    return { jsonrpc: '2.0', id, result: result ?? null };
  } catch (error) {
    log(`RPC handler "${method}" failed: ${String(error)}`);
    if (isRpcError(error)) {
      return { jsonrpc: '2.0', id, error };
    }
    const message = error instanceof Error ? error.message : 'Internal error';
    return {
      jsonrpc: '2.0',
      id,
      error: rpcErrors.internal({ message }).serialize(),
    };
  }
}

/**
 * Narrow `params` to the shape handlers expect. JSON-RPC 2.0 requires
 * `params`, when present, to be an array or object; both are valid `Json`.
 *
 * @param params - The validated `params` field from a JSON-RPC request.
 * @returns The same value, or `null` when absent.
 */
function coerceHandlerParams(
  params: JsonRpcParams | undefined,
): JsonRpcParams | null {
  return params ?? null;
}

/**
 * Per JSON-RPC 2.0, `id` must be a string, number, or null. Used when
 * salvaging an `id` from a parse-success-but-not-valid-request payload.
 *
 * @param value - The candidate id.
 * @returns True if the value is an acceptable JSON-RPC id.
 */
function isValidJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    value === null || typeof value === 'string' || typeof value === 'number'
  );
}

/**
 * Check if an error is an RPC error with a numeric code.
 *
 * @param error - The error to check.
 * @returns True if the error has a numeric code property.
 */
function isRpcError(
  error: unknown,
): error is { code: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    hasProperty(error, 'code') &&
    typeof error.code === 'number' &&
    hasProperty(error, 'message') &&
    typeof error.message === 'string'
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
  } catch (error) {
    if (!isErrorWithCode(error, 'ENOENT')) {
      throw error;
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  // Restrict the socket to its owner. The daemon hosts an unlocked wallet, so
  // a world-connectable socket would let any local user drive it. listen()
  // creates the socket with umask-derived (typically world-accessible) perms.
  try {
    await chmod(socketPath, 0o600);
  } catch (error) {
    // Never leave a possibly world-accessible socket listening with no handle
    // to close it. Cleanup is best-effort so the chmod failure still surfaces.
    await closeServer(server).catch(() => undefined);
    await unlink(socketPath).catch(() => undefined);
    throw error;
  }
}

/**
 * Close a server, resolving once it stops accepting connections.
 *
 * @param server - The net.Server instance.
 */
async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
