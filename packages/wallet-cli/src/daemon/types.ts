import type { Json } from '@metamask/utils';

/**
 * Sink for daemon diagnostic messages. A backgrounded daemon's stdio may be
 * discarded, so hosts supply a logger that writes somewhere durable.
 */
export type Logger = (message: string) => void;

/**
 * A function that handles a JSON-RPC method call.
 *
 * The `params` argument will be `null` if the client did not provide params.
 */
export type RpcHandler = (params: Json) => Promise<Json | void>;

/**
 * A map of RPC method names to their handler functions.
 */
export type RpcHandlerMap = Record<string, RpcHandler>;

/**
 * Resolved paths for daemon state files.
 */
export type DaemonPaths = {
  socketPath: string;
  pidPath: string;
  logPath: string;
  dbPath: string;
};

/**
 * Status information returned by the daemon's `getStatus` RPC method.
 */
export type DaemonStatusInfo = {
  pid: number;
  uptime: number;
};

/**
 * Configuration passed to the daemon spawner.
 *
 * `password` is optional: when omitted, the daemon starts without unlocking
 * the keyring, and the caller is expected to use `mm wallet unlock` before
 * any keyring-bound operation. First-run startup still requires both
 * `password` and `srp`; without `password`, the daemon will exit during
 * startup with a clear error. `srp` is always required by the type and
 * forwarded to the daemon; it is only consumed on first run.
 */
export type DaemonSpawnConfig = {
  dataDir: string;
  infuraProjectId: string;
  password?: string;
  srp: string;
  packageRoot: string;
};
