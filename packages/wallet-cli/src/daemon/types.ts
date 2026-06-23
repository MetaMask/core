import type { Json } from '@metamask/utils';

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
 */
export type DaemonSpawnConfig = {
  dataDir: string;
  infuraProjectId: string;
  password: string;
  srp: string;
  packageRoot: string;
};
