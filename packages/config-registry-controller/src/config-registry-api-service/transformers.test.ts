import type { NetworkConfiguration } from '@metamask/network-controller';
import { RpcEndpointType } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { NetworkConfig } from './abstract-config-registry-api-service';
import {
  compareWithExistingNetworks,
  filterNetworks,
  processNetworkConfigs,
  transformNetworkConfig,
} from './transformers';

const VALID_NETWORK_CONFIG: NetworkConfig = {
  chainId: '0x1',
  name: 'Ethereum Mainnet',
  nativeCurrency: 'ETH',
  rpcEndpoints: [
    {
      url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
      type: 'infura',
      networkClientId: 'mainnet',
      failoverUrls: ['https://backup.infura.io/v3/{infuraProjectId}'],
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
};

const VALID_CUSTOM_NETWORK_CONFIG: NetworkConfig = {
  chainId: '0x89',
  name: 'Polygon',
  nativeCurrency: 'MATIC',
  rpcEndpoints: [
    {
      url: 'https://polygon-rpc.com',
      type: 'custom',
      networkClientId: 'custom-polygon',
      failoverUrls: [],
    },
  ],
  blockExplorerUrls: ['https://polygonscan.com'],
  defaultRpcEndpointIndex: 0,
  defaultBlockExplorerUrlIndex: 0,
  isActive: true,
  isTestnet: false,
  isDefault: false,
  isFeatured: true,
  isDeprecated: false,
  priority: 1,
  isDeletable: false,
};

describe('transformers', () => {
  describe('transformNetworkConfig', () => {
    it('should transform valid network config with infura endpoint', () => {
      const result = transformNetworkConfig(VALID_NETWORK_CONFIG);

      expect(result).not.toBeNull();
      expect(result?.chainId).toBe('0x1');
      expect(result?.name).toBe('Ethereum Mainnet');
      expect(result?.nativeCurrency).toBe('ETH');
      expect(result?.rpcEndpoints).toHaveLength(1);
      expect(result?.rpcEndpoints[0].type).toBe(RpcEndpointType.Infura);
      expect(result?.rpcEndpoints[0].networkClientId).toBe('mainnet');
      expect(result?.rpcEndpoints[0].failoverUrls).toStrictEqual([
        'https://backup.infura.io/v3/{infuraProjectId}',
      ]);
      expect(result?.blockExplorerUrls).toStrictEqual(['https://etherscan.io']);
      expect(result?.defaultRpcEndpointIndex).toBe(0);
      expect(result?.defaultBlockExplorerUrlIndex).toBe(0);
    });

    it('should transform valid network config with custom endpoint', () => {
      const result = transformNetworkConfig(VALID_CUSTOM_NETWORK_CONFIG);

      expect(result).not.toBeNull();
      expect(result?.chainId).toBe('0x89');
      expect(result?.rpcEndpoints[0].type).toBe(RpcEndpointType.Custom);
      expect(result?.rpcEndpoints[0].url).toBe('https://polygon-rpc.com');
    });

    it('should convert decimal chain ID to hex', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        chainId: '1',
      };

      const result = transformNetworkConfig(config);

      expect(result?.chainId).toBe('0x1');
    });

    it('should handle chain ID with 0x prefix', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        chainId: '0X1',
      };

      const result = transformNetworkConfig(config);

      expect(result?.chainId).toBe('0x1');
    });

    it('should return null for invalid chain ID', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        chainId: 'invalid',
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for negative chain ID', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        chainId: '-1',
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for empty chain ID', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        chainId: '',
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for invalid hex chain ID', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        chainId: '0xinvalid',
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for missing name', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        name: '',
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for missing nativeCurrency', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        nativeCurrency: '',
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for empty rpcEndpoints', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [],
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for invalid rpcEndpoint', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            url: '',
            type: 'infura',
            networkClientId: 'mainnet',
            failoverUrls: [],
          },
        ],
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for invalid rpcEndpoint type', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            url: 'https://example.com',
            type: 'invalid',
            networkClientId: 'test',
            failoverUrls: [],
          },
        ],
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for null rpcEndpoint', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [null as unknown as NetworkConfig['rpcEndpoints'][0]],
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for rpcEndpoint with empty type', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            url: 'https://example.com',
            type: '',
            networkClientId: 'test',
            failoverUrls: [],
          },
        ],
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for rpcEndpoint with empty networkClientId', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            url: 'https://example.com',
            type: 'custom',
            networkClientId: '',
            failoverUrls: [],
          },
        ],
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should filter invalid failoverUrls', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
            type: 'infura',
            networkClientId: 'mainnet',
            failoverUrls: [
              'valid-url',
              null,
              undefined,
              123,
            ] as unknown as string[],
          },
        ],
      };

      const result = transformNetworkConfig(config);

      expect(result?.rpcEndpoints[0].failoverUrls).toStrictEqual(['valid-url']);
    });

    it('should set failoverUrls to undefined when not an array', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
            type: 'infura',
            networkClientId: 'mainnet',
            failoverUrls: 'not-an-array' as unknown as string[],
          },
        ],
      };

      const result = transformNetworkConfig(config);

      expect(result?.rpcEndpoints[0].failoverUrls).toBeUndefined();
    });

    it('should return null for invalid defaultRpcEndpointIndex', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        defaultRpcEndpointIndex: 10,
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for negative defaultRpcEndpointIndex', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        defaultRpcEndpointIndex: -1,
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should filter invalid blockExplorerUrls', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        blockExplorerUrls: [
          'https://etherscan.io',
          '',
          null,
          undefined,
          123,
        ] as unknown as string[],
      };

      const result = transformNetworkConfig(config);

      expect(result?.blockExplorerUrls).toStrictEqual(['https://etherscan.io']);
    });

    it('should return null for non-array blockExplorerUrls', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        blockExplorerUrls: 'not-an-array' as unknown as string[],
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should return null for invalid defaultBlockExplorerUrlIndex', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        defaultBlockExplorerUrlIndex: 10,
      };

      const result = transformNetworkConfig(config);

      expect(result).toBeNull();
    });

    it('should set defaultBlockExplorerUrlIndex to 0 when not provided and urls exist', () => {
      const { defaultBlockExplorerUrlIndex, ...configWithoutIndex } =
        VALID_NETWORK_CONFIG;
      const config = {
        ...configWithoutIndex,
      } as NetworkConfig;

      const result = transformNetworkConfig(config);

      expect(result?.defaultBlockExplorerUrlIndex).toBe(0);
    });

    it('should set defaultBlockExplorerUrlIndex to undefined when no urls', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        blockExplorerUrls: [],
        defaultBlockExplorerUrlIndex: 0,
      };

      const result = transformNetworkConfig(config);

      expect(result?.defaultBlockExplorerUrlIndex).toBeUndefined();
    });

    it('should use defaultRpcEndpointIndex from config when provided', () => {
      const config = {
        ...VALID_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
            type: 'infura',
            networkClientId: 'mainnet',
            failoverUrls: [],
          },
          {
            url: 'https://backup.infura.io/v3/{infuraProjectId}',
            type: 'infura',
            networkClientId: 'mainnet',
            failoverUrls: [],
          },
        ],
        defaultRpcEndpointIndex: 1,
      };

      const result = transformNetworkConfig(config);

      expect(result?.defaultRpcEndpointIndex).toBe(1);
    });

    it('should preserve lastUpdatedAt', () => {
      const timestamp = 1234567890;
      const config = {
        ...VALID_NETWORK_CONFIG,
        lastUpdatedAt: timestamp,
      };

      const result = transformNetworkConfig(config);

      expect(result?.lastUpdatedAt).toBe(timestamp);
    });

    it('should return null for null input', () => {
      const result = transformNetworkConfig(null as unknown as NetworkConfig);

      expect(result).toBeNull();
    });

    it('should return null for non-object input', () => {
      const result = transformNetworkConfig(
        'invalid' as unknown as NetworkConfig,
      );

      expect(result).toBeNull();
    });
  });

  describe('filterNetworks', () => {
    const networks: NetworkConfig[] = [
      {
        ...VALID_NETWORK_CONFIG,
        isFeatured: true,
        isTestnet: false,
        isActive: true,
        isDeprecated: false,
        isDefault: true,
      },
      {
        ...VALID_NETWORK_CONFIG,
        chainId: '0x5',
        isFeatured: false,
        isTestnet: true,
        isActive: true,
        isDeprecated: false,
        isDefault: false,
      },
      {
        ...VALID_NETWORK_CONFIG,
        chainId: '0x2a',
        isFeatured: true,
        isTestnet: false,
        isActive: false,
        isDeprecated: true,
        isDefault: false,
      },
    ];

    it('should return all networks when no filters applied', () => {
      const result = filterNetworks(networks);

      expect(result).toHaveLength(3);
    });

    it('should filter by isFeatured', () => {
      const result = filterNetworks(networks, { isFeatured: true });

      expect(result).toHaveLength(2);
      expect(result.every((n) => n.isFeatured)).toBe(true);
    });

    it('should filter by isTestnet', () => {
      const result = filterNetworks(networks, { isTestnet: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x5');
    });

    it('should filter by isActive', () => {
      const result = filterNetworks(networks, { isActive: true });

      expect(result).toHaveLength(2);
      expect(result.every((n) => n.isActive)).toBe(true);
    });

    it('should filter by isDeprecated', () => {
      const result = filterNetworks(networks, { isDeprecated: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x2a');
    });

    it('should filter by isDefault', () => {
      const result = filterNetworks(networks, { isDefault: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x1');
    });

    it('should filter by multiple criteria', () => {
      const result = filterNetworks(networks, {
        isFeatured: true,
        isActive: true,
        isTestnet: false,
      });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x1');
    });

    it('should return empty array for non-array input', () => {
      const result = filterNetworks(null as unknown as NetworkConfig[]);

      expect(result).toStrictEqual([]);
    });

    it('should filter out invalid network objects', () => {
      const invalidNetworks = [
        null,
        undefined,
        'invalid',
        123,
        ...networks,
      ] as unknown as NetworkConfig[];

      const result = filterNetworks(invalidNetworks);

      expect(result).toHaveLength(3);
    });

    it('should return empty array for empty input', () => {
      const result = filterNetworks([]);

      expect(result).toStrictEqual([]);
    });
  });

  describe('compareWithExistingNetworks', () => {
    const existingNetworks: Record<Hex, NetworkConfiguration> = {
      '0x1': {
        chainId: '0x1',
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        rpcEndpoints: [],
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
      },
      '0x89': {
        chainId: '0x89',
        name: 'Polygon',
        nativeCurrency: 'MATIC',
        rpcEndpoints: [],
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
      },
    };

    it('should identify new networks to add', () => {
      const newNetwork: NetworkConfiguration = {
        chainId: '0xa',
        name: 'Optimism',
        nativeCurrency: 'ETH',
        rpcEndpoints: [],
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
      };

      const result = compareWithExistingNetworks([newNetwork], {
        existingNetworks,
      });

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.networksToAdd[0].chainId).toBe('0xa');
      expect(result.existingChainIds).toHaveLength(0);
    });

    it('should identify existing chain IDs', () => {
      const existingNetwork: NetworkConfiguration = {
        chainId: '0x1',
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        rpcEndpoints: [],
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
      };

      const result = compareWithExistingNetworks([existingNetwork], {
        existingNetworks,
      });

      expect(result.networksToAdd).toHaveLength(0);
      expect(result.existingChainIds).toContain('0x1');
    });

    it('should handle mix of new and existing networks', () => {
      const networks: NetworkConfiguration[] = [
        {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
        {
          chainId: '0xa',
          name: 'Optimism',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
        {
          chainId: '0x89',
          name: 'Polygon',
          nativeCurrency: 'MATIC',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
      ];

      const result = compareWithExistingNetworks(networks, {
        existingNetworks,
      });

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.networksToAdd[0].chainId).toBe('0xa');
      expect(result.existingChainIds).toHaveLength(2);
      expect(result.existingChainIds).toContain('0x1');
      expect(result.existingChainIds).toContain('0x89');
    });

    it('should return all networks when no existing networks provided', () => {
      const networks: NetworkConfiguration[] = [
        {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
      ];

      const result = compareWithExistingNetworks(networks, {
        existingNetworks: {},
      });

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.existingChainIds).toHaveLength(0);
    });

    it('should handle null existingNetworks', () => {
      const networks: NetworkConfiguration[] = [
        {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
      ];

      const result = compareWithExistingNetworks(networks, {
        existingNetworks: null as unknown as Record<Hex, NetworkConfiguration>,
      });

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.existingChainIds).toHaveLength(0);
    });

    it('should skip networks without chainId', () => {
      const networks: NetworkConfiguration[] = [
        {
          chainId: '0x1' as Hex,
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
        null as unknown as NetworkConfiguration,
        {
          chainId: undefined as unknown as Hex,
          name: 'Invalid',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
      ];

      const result = compareWithExistingNetworks(networks, {
        existingNetworks,
      });

      expect(result.networksToAdd).toHaveLength(0);
      expect(result.existingChainIds).toContain('0x1');
    });

    it('should return empty arrays for non-array input', () => {
      const result = compareWithExistingNetworks(
        null as unknown as NetworkConfiguration[],
        {
          existingNetworks,
        },
      );

      expect(result.networksToAdd).toStrictEqual([]);
      expect(result.existingChainIds).toStrictEqual([]);
    });
  });

  describe('processNetworkConfigs', () => {
    it('should process networks without filtering or comparison', () => {
      const networks = [VALID_NETWORK_CONFIG];

      const result = processNetworkConfigs(networks);

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.existingChainIds).toHaveLength(0);
    });

    it('should filter networks before processing', () => {
      const networks = [
        VALID_NETWORK_CONFIG,
        {
          ...VALID_NETWORK_CONFIG,
          chainId: '0x5',
          isFeatured: false,
        },
      ];

      const result = processNetworkConfigs(networks, { isFeatured: true });

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.networksToAdd[0].chainId).toBe('0x1');
    });

    it('should compare with existing networks', () => {
      const existingNetworks: Record<Hex, NetworkConfiguration> = {
        '0x1': {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
      };

      const networks = [VALID_NETWORK_CONFIG, VALID_CUSTOM_NETWORK_CONFIG];

      const result = processNetworkConfigs(networks, {}, { existingNetworks });

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.networksToAdd[0].chainId).toBe('0x89');
      expect(result.existingChainIds).toContain('0x1');
    });

    it('should filter invalid networks during transformation', () => {
      const networks = [
        VALID_NETWORK_CONFIG,
        {
          ...VALID_NETWORK_CONFIG,
          chainId: 'invalid',
        },
        null as unknown as NetworkConfig,
      ];

      const result = processNetworkConfigs(networks);

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.networksToAdd[0].chainId).toBe('0x1');
    });

    it('should return empty arrays for empty input', () => {
      const result = processNetworkConfigs([]);

      expect(result.networksToAdd).toStrictEqual([]);
      expect(result.existingChainIds).toStrictEqual([]);
    });

    it('should return empty arrays for non-array input', () => {
      const result = processNetworkConfigs(null as unknown as NetworkConfig[]);

      expect(result.networksToAdd).toStrictEqual([]);
      expect(result.existingChainIds).toStrictEqual([]);
    });

    it('should combine filtering and comparison', () => {
      const existingNetworks: Record<Hex, NetworkConfiguration> = {
        '0x1': {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [],
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
        },
      };

      const networks = [
        VALID_NETWORK_CONFIG,
        {
          ...VALID_NETWORK_CONFIG,
          chainId: '0x5',
          isFeatured: false,
        },
        VALID_CUSTOM_NETWORK_CONFIG,
      ];

      const result = processNetworkConfigs(
        networks,
        { isFeatured: true },
        { existingNetworks },
      );

      expect(result.networksToAdd).toHaveLength(1);
      expect(result.networksToAdd[0].chainId).toBe('0x89');
      expect(result.existingChainIds).toContain('0x1');
    });
  });
});
