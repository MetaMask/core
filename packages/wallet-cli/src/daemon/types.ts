import type { Struct } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

/**
 * Sink for daemon diagnostic messages. A backgrounded daemon's stdio may be
 * discarded, so hosts supply a logger that writes somewhere durable.
 */
export type Logger = (message: string) => void;

/**
 * A function that handles a JSON-RPC method call after its params have been
 * validated by the corresponding {@link RpcHandlerDefinition.paramsStruct}.
 */
export type RpcHandler<TParams, TResult> = (
  params: TParams,
) => Promise<TResult>;

/**
 * Definition for a single JSON-RPC method: the struct that validates
 * incoming `params` plus the handler that runs once `params` is known to
 * match.
 *
 * The server (see `rpc-socket-server.ts`) validates the raw `params` against
 * `paramsStruct` before invoking `run`, so each handler body can trust the
 * shape of its input without re-checking.
 */
export type RpcHandlerDefinition<TParams, TResult extends Json | void> = {
  paramsStruct: Struct<TParams>;
  run: RpcHandler<TParams, TResult>;
};

/**
 * A map of RPC method names to their handler definitions.
 *
 * `TParams` is erased to `unknown` here so definitions with different narrow
 * params types (e.g. `null` vs. a tuple) can coexist in the same map. Consumers
 * therefore see each `run` as accepting `unknown` and must validate `params`
 * against the paired `paramsStruct` before invoking it — which is exactly what
 * the server (see `rpc-socket-server.ts`) does. The concrete `TParams` is
 * captured inside {@link defineHandler}, where the struct and handler are bound
 * together.
 */
export type RpcHandlerMap = Record<
  string,
  RpcHandlerDefinition<unknown, Json | void>
>;

/**
 * Bundle a params struct with the handler that runs once `params` is
 * validated. The server invokes `run` only after `paramsStruct` accepts the
 * value, so `run` can trust the type of its argument.
 *
 * The returned definition erases `TParams` to `unknown` so heterogeneous
 * handlers can share an {@link RpcHandlerMap}.
 *
 * @param paramsStruct - Struct that validates `params` for this method.
 * @param run - Handler invoked with the validated params.
 * @returns An {@link RpcHandlerDefinition} suitable for an {@link RpcHandlerMap}.
 */
export function defineHandler<TParams, TResult extends Json | void>(
  paramsStruct: Struct<TParams>,
  run: RpcHandler<TParams, TResult>,
): RpcHandlerDefinition<unknown, TResult> {
  return { paramsStruct, run } as unknown as RpcHandlerDefinition<
    unknown,
    TResult
  >;
}

/**
 * Typed wrapper around `wallet.messenger.call` used by the `call` RPC.
 *
 * The messenger is strongly typed by action name; the daemon exposes the full
 * messenger surface over the socket and dispatches by string, so we consolidate
 * the unsafe cast into a single, documented escape hatch instead of repeating
 * it at each call site.
 */
export type RpcDispatcher = (action: string, ...args: Json[]) => Promise<Json>;

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
