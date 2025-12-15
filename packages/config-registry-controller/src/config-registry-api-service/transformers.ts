import type { NetworkConfiguration } from '@metamask/network-controller';
import { RpcEndpointType } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { NetworkConfig } from './abstract-config-registry-api-service';

type RpcEndpoint = NetworkConfiguration['rpcEndpoints'][number];

export type NetworkFilterOptions = {
  isFeatured?: boolean;
  isTestnet?: boolean;
  isActive?: boolean;
  isDeprecated?: boolean;
  isDefault?: boolean;
};

export type NetworkComparisonOptions = {
  existingNetworks: Record<Hex, NetworkConfiguration>;
};

export type TransformedNetworkResult = {
  networksToAdd: NetworkConfiguration[];
  existingChainIds: Hex[];
};

/**
 * @param chainId - The chain ID as a string.
 * @returns The chain ID as Hex, or null if invalid.
 */
function toHexChainId(chainId: string): Hex | null {
  if (!chainId || typeof chainId !== 'string') {
    return null;
  }

  const trimmed = chainId.trim();

  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const hex = trimmed.toLowerCase();
    if (!/^0x[0-9a-f]+$/iu.test(hex)) {
      return null;
    }
    return hex as Hex;
  }

  const decimal = Number.parseInt(trimmed, 10);
  if (Number.isNaN(decimal) || decimal < 0) {
    return null;
  }

  return `0x${decimal.toString(16)}` as Hex;
}

/**
 * @param endpoint - The RPC endpoint from the API.
 * @returns The transformed RPC endpoint, or null if invalid.
 */
function transformRpcEndpoint(
  endpoint: NetworkConfig['rpcEndpoints'][0],
): RpcEndpoint | null {
  if (!endpoint || typeof endpoint !== 'object') {
    return null;
  }

  const { url, type, networkClientId, failoverUrls } = endpoint;

  if (!url || typeof url !== 'string') {
    return null;
  }

  if (!type || typeof type !== 'string') {
    return null;
  }

  if (!networkClientId || typeof networkClientId !== 'string') {
    return null;
  }

  const baseEndpoint = {
    networkClientId: networkClientId as string,
    failoverUrls: Array.isArray(failoverUrls)
      ? failoverUrls.filter(
          (failoverUrl): failoverUrl is string =>
            typeof failoverUrl === 'string',
        )
      : undefined,
  };

  if (type === 'infura') {
    return {
      ...baseEndpoint,
      type: RpcEndpointType.Infura,
      url: url as `https://${string}.infura.io/v3/{infuraProjectId}`,
    } as RpcEndpoint;
  }

  if (type === 'custom') {
    return {
      ...baseEndpoint,
      type: RpcEndpointType.Custom,
      url,
    } as RpcEndpoint;
  }

  return null;
}

/**
 * @param networkConfig - The network configuration from the API.
 * @returns The transformed network configuration, or null if invalid.
 */
export function transformNetworkConfig(
  networkConfig: NetworkConfig,
): NetworkConfiguration | null {
  if (!networkConfig || typeof networkConfig !== 'object') {
    return null;
  }

  const chainId = toHexChainId(networkConfig.chainId);
  if (!chainId) {
    return null;
  }

  const { name, nativeCurrency, rpcEndpoints, blockExplorerUrls } =
    networkConfig;

  if (!name || typeof name !== 'string') {
    return null;
  }

  if (!nativeCurrency || typeof nativeCurrency !== 'string') {
    return null;
  }

  if (!Array.isArray(rpcEndpoints) || rpcEndpoints.length === 0) {
    return null;
  }

  const transformedEndpoints = rpcEndpoints
    .map(transformRpcEndpoint)
    .filter((endpoint): endpoint is RpcEndpoint => endpoint !== null);

  if (transformedEndpoints.length === 0) {
    return null;
  }

  const defaultRpcEndpointIndex = networkConfig.defaultRpcEndpointIndex ?? 0;
  if (
    defaultRpcEndpointIndex < 0 ||
    defaultRpcEndpointIndex >= transformedEndpoints.length
  ) {
    return null;
  }

  if (!Array.isArray(blockExplorerUrls)) {
    return null;
  }

  const validBlockExplorerUrls = blockExplorerUrls.filter(
    (blockExplorerUrl): blockExplorerUrl is string =>
      typeof blockExplorerUrl === 'string' && blockExplorerUrl.length > 0,
  );

  const { defaultBlockExplorerUrlIndex } = networkConfig;
  if (
    defaultBlockExplorerUrlIndex !== undefined &&
    (defaultBlockExplorerUrlIndex < 0 ||
      defaultBlockExplorerUrlIndex >= validBlockExplorerUrls.length)
  ) {
    return null;
  }

  return {
    chainId,
    name,
    nativeCurrency,
    rpcEndpoints: transformedEndpoints,
    blockExplorerUrls: validBlockExplorerUrls,
    defaultRpcEndpointIndex,
    defaultBlockExplorerUrlIndex:
      validBlockExplorerUrls.length > 0
        ? (defaultBlockExplorerUrlIndex ?? 0)
        : undefined,
    lastUpdatedAt: networkConfig.lastUpdatedAt,
  };
}

/**
 * @param networks - Array of network configurations to filter.
 * @param options - Filter options.
 * @returns Filtered array of network configurations.
 */
export function filterNetworks(
  networks: NetworkConfig[],
  options: NetworkFilterOptions = {},
): NetworkConfig[] {
  if (!Array.isArray(networks)) {
    return [];
  }

  return networks.filter((network) => {
    if (!network || typeof network !== 'object') {
      return false;
    }

    if (options.isFeatured !== undefined) {
      if (network.isFeatured !== options.isFeatured) {
        return false;
      }
    }

    if (options.isTestnet !== undefined) {
      if (network.isTestnet !== options.isTestnet) {
        return false;
      }
    }

    if (options.isActive !== undefined) {
      if (network.isActive !== options.isActive) {
        return false;
      }
    }

    if (options.isDeprecated !== undefined) {
      if (network.isDeprecated !== options.isDeprecated) {
        return false;
      }
    }

    if (options.isDefault !== undefined) {
      if (network.isDefault !== options.isDefault) {
        return false;
      }
    }

    return true;
  });
}

/**
 * @param transformedNetworks - Array of transformed network configurations.
 * @param options - Comparison options.
 * @returns Result containing networks to add and existing chain IDs.
 */
export function compareWithExistingNetworks(
  transformedNetworks: NetworkConfiguration[],
  options: NetworkComparisonOptions,
): TransformedNetworkResult {
  if (!Array.isArray(transformedNetworks)) {
    return {
      networksToAdd: [],
      existingChainIds: [],
    };
  }

  const { existingNetworks } = options;

  if (!existingNetworks || typeof existingNetworks !== 'object') {
    return {
      networksToAdd: transformedNetworks,
      existingChainIds: [],
    };
  }

  const existingChainIds = new Set<Hex>(Object.keys(existingNetworks) as Hex[]);
  const networksToAdd: NetworkConfiguration[] = [];
  const foundExistingChainIds: Hex[] = [];

  for (const network of transformedNetworks) {
    if (!network || !network.chainId) {
      continue;
    }

    if (existingChainIds.has(network.chainId)) {
      foundExistingChainIds.push(network.chainId);
    } else {
      networksToAdd.push(network);
    }
  }

  return {
    networksToAdd,
    existingChainIds: foundExistingChainIds,
  };
}

/**
 * @param networks - Array of network configurations from the API.
 * @param filterOptions - Options for filtering networks.
 * @param comparisonOptions - Options for comparing with existing networks.
 * @returns Result containing networks to add and existing chain IDs.
 */
export function processNetworkConfigs(
  networks: NetworkConfig[],
  filterOptions: NetworkFilterOptions = {},
  comparisonOptions?: NetworkComparisonOptions,
): TransformedNetworkResult {
  if (!Array.isArray(networks) || networks.length === 0) {
    return {
      networksToAdd: [],
      existingChainIds: [],
    };
  }

  const filteredNetworks = filterNetworks(networks, filterOptions);

  const transformedNetworks = filteredNetworks
    .map(transformNetworkConfig)
    .filter((network): network is NetworkConfiguration => network !== null);

  if (comparisonOptions) {
    return compareWithExistingNetworks(transformedNetworks, comparisonOptions);
  }

  return {
    networksToAdd: transformedNetworks,
    existingChainIds: [],
  };
}
