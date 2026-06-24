import { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

/**
 * The RPC failover behavior for Infura networks, controlled by the
 * `corePlatformRpcFailoverMode` remote feature flag.
 *
 * - `disabled`: failover URLs are ignored; traffic stays on the primary
 *   endpoint.
 * - `enabled`: traffic automatically diverts to failover URLs when the primary
 *   endpoint is unavailable.
 * - `forced`: Infura endpoints that have failover URLs route all traffic to
 *   those failover URLs, bypassing Infura entirely.
 */
type RpcFailoverMode = 'disabled' | 'enabled' | 'forced';

/**
 * Reads the RPC failover mode from the remote feature flags, defaulting to
 * `disabled` when the flag is absent or not a recognized value.
 *
 * @param state - The remote feature flag controller state.
 * @returns The RPC failover mode.
 */
function getRpcFailoverMode(
  state: RemoteFeatureFlagControllerState,
): RpcFailoverMode {
  const mode = state.remoteFeatureFlags.corePlatformRpcFailoverMode;
  return mode === 'enabled' || mode === 'forced' ? mode : 'disabled';
}

/**
 * Whether normal RPC failover is active, i.e. traffic should divert to the
 * configured failover URLs when the primary endpoint is unavailable. Only true
 * for the `enabled` mode; the `forced` mode is handled by
 * {@link getIsRpcFailoverForced}.
 *
 * @param state - The remote feature flag controller state.
 * @returns Whether RPC failover is enabled.
 */
export function getIsRpcFailoverEnabled(
  state: RemoteFeatureFlagControllerState,
): boolean {
  return getRpcFailoverMode(state) === 'enabled';
}

/**
 * Whether RPC failover is forced for Infura endpoints, routing all traffic to
 * configured failover URLs and bypassing Infura entirely.
 *
 * @param state - The remote feature flag controller state.
 * @returns Whether forced RPC failover is enabled.
 */
export function getIsRpcFailoverForced(
  state: RemoteFeatureFlagControllerState,
): boolean {
  return getRpcFailoverMode(state) === 'forced';
}
