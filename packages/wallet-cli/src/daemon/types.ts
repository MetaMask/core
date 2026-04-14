import type { Json } from '@metamask/utils';

/**
 * A function that handles a JSON-RPC method call.
 */
export type RpcHandler = (params: Json) => Promise<Json>;

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
};

/**
 * Configuration passed to the daemon spawner.
 */
export type DaemonSpawnConfig = {
  dataDir: string;
  socketPath: string;
  logPath: string;
  infuraProjectId: string;
  password: string;
  srp: string;
  packageRoot: string;
};
