import type { RegistryNetworkConfig } from './config-registry-api-service';

/**
 * Creates a mock RegistryNetworkConfig for testing.
 *
 * @param overrides - Optional properties to override in the default RegistryNetworkConfig.
 * @returns A mock RegistryNetworkConfig object.
 */
export function createMockNetworkConfig(
  overrides: Partial<RegistryNetworkConfig> = {},
): RegistryNetworkConfig {
  return {
    chainId: '0x1',
    name: 'Ethereum Mainnet',
    nativeCurrency: 'ETH',
    rpcEndpoints: [
      {
        url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
        type: 'infura',
        networkClientId: 'mainnet',
        failoverUrls: [],
      },
    ],
    blockExplorerUrls: ['https://etherscan.io'],
    defaultRpcEndpointIndex: 0,
    defaultBlockExplorerUrlIndex: 0,
    isActive: true,
    isTestnet: false,
    isDefault: true,
    isFeatured: true,
    isDeprecated: false,
    priority: 0,
    isDeletable: false,
    ...overrides,
  };
}
