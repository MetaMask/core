import type { JsonRpcResponse } from '@metamask/utils';
import { assertIsJsonRpcResponse } from '@metamask/utils';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';

import { readLine, writeLine } from './socket-line';

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
  params?: Record<string, unknown> | unknown[] | undefined;
  /** Response read timeout in milliseconds (default: 30 000). */
  timeoutMs?: number | undefined;
};

/**
 * Connect to a Unix domain socket.
 *
 * @param socketPath - The socket path to connect to.
 * @returns A connected socket.
 */
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
 * on transient connection errors (ECONNREFUSED, ECONNRESET).
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
      return parsed;
    } finally {
      socket.destroy();
    }
  };

  try {
    return await attempt();
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'ECONNREFUSED' && code !== 'ECONNRESET') {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    return attempt();
  }
}

/**
 * Check whether the daemon is running by sending a lightweight `getStatus`
 * RPC call.
 *
 * @param socketPath - The Unix socket path.
 * @returns True if the daemon responds to the RPC call.
 */
export async function pingDaemon(socketPath: string): Promise<boolean> {
  try {
    await sendCommand({ socketPath, method: 'getStatus', timeoutMs: 3_000 });
    return true;
  } catch {
    return false;
  }
}
