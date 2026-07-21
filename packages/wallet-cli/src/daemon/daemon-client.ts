import type { JsonRpcParams, JsonRpcResponse } from '@metamask/utils';
import { assertIsJsonRpcResponse } from '@metamask/utils';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';

import { readLine, writeLine } from './socket-line.js';
import { isErrorWithCode } from './utils.js';

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
      socket.removeAllListeners('error');
      resolve(socket);
    });
    socket.on('error', (error) => {
      // A failed connect never reaches the caller, so destroy the socket here
      // to avoid leaking its file descriptor.
      socket.destroy();
      reject(error);
    });
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
 * Why an unreachable daemon cannot be queried.
 *
 * - `'refused'`: connection refused after retry (`ECONNREFUSED` / `ECONNRESET`).
 *   Typical of a daemon that has crashed or is mid-restart.
 * - `'timeout'`: the daemon accepted the connection but did not respond within
 *   the read timeout — most likely wedged on a long-running operation.
 * - `'permission'`: the socket exists but cannot be opened (`EACCES` / `EPERM`).
 *   The daemon almost certainly belongs to another user.
 * - `'protocol'`: the daemon responded but the response did not parse as a
 *   valid JSON-RPC response, or the response id did not match.
 * - `'other'`: anything else.
 */
export type PingUnreachableReason =
  | 'refused'
  | 'timeout'
  | 'permission'
  | 'protocol'
  | 'other';

/**
 * Outcome of a daemon health check.
 *
 * - `'responsive'`: the daemon answered a `getStatus` RPC.
 * - `'absent'`: the socket connect attempt failed with `ENOENT`, i.e. no
 *   socket file exists at the path. No daemon present.
 * - `'unreachable'`: any other non-success outcome. The daemon may still be
 *   alive but is not responding. Callers should not silently take over the
 *   slot or assume the daemon is dead. The `reason` field categorises the
 *   failure so callers can distinguish a wedged sibling daemon from a
 *   foreign-user daemon from a transient crash. User-initiated stop / purge
 *   flows may still escalate to signals against the recorded PID.
 */
export type PingResult =
  | { status: 'responsive' }
  | { status: 'absent' }
  | { status: 'unreachable'; reason: PingUnreachableReason; error: Error };

/**
 * Normalize an unknown throw into a real Error instance so that downstream
 * consumers (which read `.message`) cannot crash on string/object throws.
 *
 * @param error - The caught value.
 * @returns An Error mirroring the caught value.
 */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Categorise an unreachable error by Node errno / message shape so callers can
 * make decisions per failure mode rather than parsing message strings.
 *
 * @param error - The caught value.
 * @returns A {@link PingUnreachableReason} label.
 */
function classifyUnreachable(error: unknown): PingUnreachableReason {
  if (
    isErrorWithCode(error, 'ECONNREFUSED') ||
    isErrorWithCode(error, 'ECONNRESET')
  ) {
    return 'refused';
  }
  if (isErrorWithCode(error, 'EACCES') || isErrorWithCode(error, 'EPERM')) {
    return 'permission';
  }
  if (error instanceof Error && error.message === 'Socket read timed out') {
    return 'timeout';
  }
  if (
    error instanceof Error &&
    (error.message.includes('JSON-RPC response id') ||
      /Expected .* JSON-RPC/u.test(error.message) ||
      error.name === 'SyntaxError')
  ) {
    return 'protocol';
  }
  return 'other';
}

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
    return {
      status: 'unreachable',
      reason: classifyUnreachable(error),
      error: toError(error),
    };
  }
}
