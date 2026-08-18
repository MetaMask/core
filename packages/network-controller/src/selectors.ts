import { ConfigRegistryControllerState } from '@metamask/config-registry-controller';
import { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import { CaipChainId, KnownCaipNamespace } from '@metamask/utils';

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
export type RpcFailoverMode = 'disabled' | 'enabled' | 'forced';

/**
 * Reads the RPC failover mode from the remote feature flags, defaulting to
 * `disabled` when the flag is absent or not a recognized value.
 *
 * @param state - The remote feature flag controller state.
 * @returns The RPC failover mode.
 */
export function getRpcFailoverMode(
  state: RemoteFeatureFlagControllerState,
): RpcFailoverMode {
  const mode = state.remoteFeatureFlags.corePlatformRpcFailoverMode;
  return mode === 'enabled' || mode === 'forced' ? mode : 'disabled';
}

/**
 * Returns the list of CAIP-2 chain IDs for networks that are auto-enabled in the
 * config registry.
 *
 * @param state - The config registry controller state.
 * @returns The list of CAIP-2 chain IDs for auto-enabled networks.
 */
export function getConfigRegistryEvmAutoEnabledChains(
  state: ConfigRegistryControllerState,
): CaipChainId[] {
  return Object.values(state.configs.networks)
    .filter(
      ({ chainId, config }) =>
        chainId.startsWith(KnownCaipNamespace.Eip155) &&
        config.isAutoEnabled &&
        config.isActive &&
        !config.isDeprecated,
    )
    .map((config) => config.chainId);
}
