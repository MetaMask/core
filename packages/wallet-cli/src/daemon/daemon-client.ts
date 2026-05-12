import type { JsonRpcParams, JsonRpcResponse } from '@metamask/utils';
import { assertIsJsonRpcResponse } from '@metamask/utils';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';

import { readLine, writeLine } from './socket-line';
import { isErrorWithCode } from './utils';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Options for {@link sendCommand}.
 */
type SendCommandOptions = {
  /** The Unix socket path. */
  socketPath: string;
  /** The RPC method name. */
  method: string;
  /** Optional method parameters (object or positional array). */
  params?: JsonRpcParams | undefined;
  /** Response read timeout in milliseconds (default: 30 000). */
  timeoutMs?: number | undefined;
};

async function connectSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath, () => {
      socket.removeListener('error', reject);
      resolve(socket);
    });
    socket.on('error', reject);
  });
}

/**
 * Send a JSON-RPC request to the daemon over a Unix socket and return the
 * response.
 *
 * Opens a connection, writes one JSON-RPC request line, reads one JSON-RPC
 * response line, then closes the connection. Retries once after a short delay
 * on transient connection errors (ECONNREFUSED, ECONNRESET). Verifies that the
 * response `id` matches the outgoing request `id`.
 *
 * @param options - Command options.
 * @param options.socketPath - The Unix socket path.
 * @param options.method - The RPC method name.
 * @param options.params - Optional method parameters.
 * @param options.timeoutMs - Read timeout in milliseconds.
 * @returns The parsed JSON-RPC response.
 */
export async function sendCommand({
  socketPath,
  method,
  params,
  timeoutMs,
}: SendCommandOptions): Promise<JsonRpcResponse> {
  const id = randomUUID();
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  };

  const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const attempt = async (): Promise<JsonRpcResponse> => {
    const socket = await connectSocket(socketPath);
    try {
      await writeLine(socket, JSON.stringify(request));
      const responseLine = await readLine(socket, effectiveTimeout);
      const parsed: unknown = JSON.parse(responseLine);
      assertIsJsonRpcResponse(parsed);
      if (parsed.id !== id) {
        throw new Error(
          `JSON-RPC response id ${JSON.stringify(parsed.id)} does not match request id ${JSON.stringify(id)}`,
        );
      }
      return parsed;
    } finally {
      socket.destroy();
    }
  };

  try {
    return await attempt();
  } catch (error: unknown) {
    if (
      !isErrorWithCode(error, 'ECONNREFUSED') &&
      !isErrorWithCode(error, 'ECONNRESET')
    ) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    return attempt();
  }
}

/**
 * Outcome of a daemon health check.
 *
 * - `'responsive'`: the daemon answered a `getStatus` RPC.
 * - `'absent'`: the socket file does not exist (ENOENT). No daemon present.
 * - `'unreachable'`: the socket exists but cannot be queried (refused after
 *   retry, timeout, permission denied, parse error, etc.). Callers should
 *   refuse to take destructive action against an unreachable daemon — the
 *   process may still be alive.
 */
export type PingResult =
  | { status: 'responsive' }
  | { status: 'absent' }
  | { status: 'unreachable'; error: Error };

/**
 * Check whether the daemon is running by sending a lightweight `getStatus`
 * RPC call. Distinguishes "no daemon present" (socket file missing) from
 * "daemon present but unreachable" (socket file exists but the daemon is
 * wedged, mid-shutdown, or owned by a different user).
 *
 * @param socketPath - The Unix socket path.
 * @returns A {@link PingResult} describing the daemon's reachability.
 */
export async function pingDaemon(socketPath: string): Promise<PingResult> {
  try {
    await sendCommand({ socketPath, method: 'getStatus', timeoutMs: 3_000 });
    return { status: 'responsive' };
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return { status: 'absent' };
    }
    return { status: 'unreachable', error: error as Error };
  }
}
