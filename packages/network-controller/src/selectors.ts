import { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import { Json } from '@metamask/utils';

/**
 * The list of possible values to control the RPC failover behavior for Infura
 * networks (also the list of values for the `corePlatformRpcFailoverMode`
 * feature flag).
 *
 * - `disabled`: failover URLs are ignored; traffic stays on the primary
 *   endpoint.
 * - `enabled`: traffic automatically diverts to failover URLs when the primary
 *   endpoint is unavailable.
 * - `forced`: Infura endpoints that have failover URLs route all traffic to
 *   those failover URLs, bypassing Infura entirely.
 */
export const RPC_FAILOVER_MODES = ['disabled', 'enabled', 'forced'] as const;

/**
 * A value to control the RPC failover behavior for Infura networks (also a
 * value of the `corePlatformRpcFailoverMode` feature flag).
 *
 * - `disabled`: failover URLs are ignored; traffic stays on the primary
 *   endpoint.
 * - `enabled`: traffic automatically diverts to failover URLs when the primary
 *   endpoint is unavailable.
 * - `forced`: Infura endpoints that have failover URLs route all traffic to
 *   those failover URLs, bypassing Infura entirely.
 */
export type RpcFailoverMode = (typeof RPC_FAILOVER_MODES)[number];

/**
 * Type guard to determine whether the given value (which could come from the
 * `corePlatformRpcFailoverMode` feature flag) is one of the possible RPC
 * failover modes.
 *
 * @param value - A value to check.
 * @returns True if given a true RPC failover mode, false otherwise.
 */
function isRpcFailoverMode(value: Json): value is RpcFailoverMode {
  return RPC_FAILOVER_MODES.includes(value as RpcFailoverMode);
}

/**
 * Reads the `corePlatformRpcFailoverMode` feature flag and attempts to
 * interpret it.
 *
 * @param state - The RemoteFeatureFlagController state.
 * @returns The RPC failover mode from `corePlatformRpcFailoverMode` if
 * recognized, or `null` otherwise.
 */
export function selectRpcFailoverModeFeatureFlag(
  state: RemoteFeatureFlagControllerState,
): RpcFailoverMode | null {
  const rpcFailoverMode = state.remoteFeatureFlags.corePlatformRpcFailoverMode;
  return isRpcFailoverMode(rpcFailoverMode) ? rpcFailoverMode : null;
}
