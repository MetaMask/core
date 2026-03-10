import type { RegistryNetworkConfig } from '../src/config-registry-api-service/types';

/**
 * Creates a mock RegistryNetworkConfig (CAIP-2 chain) for testing.
 *
 * @param overrides - Optional properties to override in the default config.
 * @returns A mock RegistryNetworkConfig object.
 */
const DEFAULT_CHAIN_CONFIG = {
  isActive: true,
  isTestnet: false,
  isDefault: true,
  isFeatured: true,
  isDeprecated: false,
  isDeletable: false,
  priority: 0,
} as const;

/** Overrides for createMockNetworkConfig; config can be partial. */
export type MockNetworkConfigOverrides = Partial<
  Omit<RegistryNetworkConfig, 'config'>
> & {
  config?: Partial<RegistryNetworkConfig['config']>;
};

export function createMockNetworkConfig(
  overrides: MockNetworkConfigOverrides = {},
): RegistryNetworkConfig {
  const base: RegistryNetworkConfig = {
    chainId: 'eip155:1',
    name: 'Ethereum Mainnet',
    imageUrl:
      'https://token.api.cx.metamask.io/assets/networkLogos/ethereum.svg',
    coingeckoPlatformId: 'ethereum',
    geckoTerminalPlatformId: 'eth',
    assets: {
      listUrl: 'https://tokens.api.cx.metamask.io/v3/chains/eip155:1/assets',
      native: {
        assetId: 'eip155:1/slip44:60',
        imageUrl:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/slip44/60.png',
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        coingeckoCoinId: 'ethereum',
      },
    },
    rpcProviders: {
      default: {
        url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
        type: 'infura',
        networkClientId: 'mainnet',
      },
      fallbacks: [],
    },
    blockExplorerUrls: {
      default: 'https://etherscan.io',
      fallbacks: [],
    },
    config: { ...DEFAULT_CHAIN_CONFIG },
  };
  const { config: configOverride, ...rest } = overrides;
  return {
    ...base,
    ...rest,
    config: configOverride
      ? { ...DEFAULT_CHAIN_CONFIG, ...configOverride }
      : base.config,
  };
}
