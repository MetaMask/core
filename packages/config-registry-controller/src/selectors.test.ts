import { createMockNetworkConfig } from '../tests/helpers.js';
import { ConfigRegistryControllerState } from './ConfigRegistryController.js';
import {
  selectEvmAutoEnabledNetworksChainIds,
  selectFeaturedNetworks,
  selectNetworks,
} from './selectors.js';

describe('selectors', () => {
  describe('selectNetworks', () => {
    it('returns all networks from state', () => {
      const networks = {
        'eip155:1': createMockNetworkConfig({ chainId: 'eip155:1' }),
        'eip155:137': createMockNetworkConfig({
          chainId: 'eip155:137',
          name: 'Polygon',
        }),
      };
      const state = {
        configs: { networks },
        version: '1.0.0',
        lastFetched: Date.now(),
        etag: null,
      };

      expect(selectNetworks(state)).toBe(networks);
      expect(selectNetworks(state)).toStrictEqual(networks);
    });
  });

  describe('selectFeaturedNetworks', () => {
    it('returns only featured, active, non-testnet networks', () => {
      const networks = {
        'eip155:1': createMockNetworkConfig({
          chainId: 'eip155:1',
          config: { isFeatured: true, isActive: true, isTestnet: false },
        }),
        'eip155:5': createMockNetworkConfig({
          chainId: 'eip155:5',
          name: 'Goerli',
          config: { isFeatured: true, isActive: true, isTestnet: true },
        }),
        'eip155:10': createMockNetworkConfig({
          chainId: 'eip155:10',
          name: 'Optimism',
          config: { isFeatured: false, isActive: true, isTestnet: false },
        }),
        'eip155:137': createMockNetworkConfig({
          chainId: 'eip155:137',
          name: 'Polygon',
          config: { isFeatured: true, isActive: false, isTestnet: false },
        }),
      };
      const state = {
        configs: { networks },
        version: '1.0.0',
        lastFetched: Date.now(),
        etag: null,
      };

      const featured = selectFeaturedNetworks(state);
      expect(Object.keys(featured)).toHaveLength(1);
      expect(featured['eip155:1']).toBeDefined();
      expect(featured['eip155:5']).toBeUndefined();
      expect(featured['eip155:10']).toBeUndefined();
      expect(featured['eip155:137']).toBeUndefined();
    });

    it('returns empty object when no networks match', () => {
      const networks = {
        'eip155:5': createMockNetworkConfig({
          chainId: 'eip155:5',
          config: { isTestnet: true },
        }),
      };
      const state = {
        configs: { networks },
        version: '1.0.0',
        lastFetched: Date.now(),
        etag: null,
      };

      const featured = selectFeaturedNetworks(state);
      expect(Object.keys(featured)).toHaveLength(0);
    });
  });

  describe('selectEvmAutoEnabledNetworksChainIds', () => {
    it('returns the list of CAIP-2 chain IDs for auto-enabled EVM networks', () => {
      const state: ConfigRegistryControllerState = {
        configs: {
          networks: {
            'eip155:1': createMockNetworkConfig({
              chainId: 'eip155:1',
              config: {
                isAutoEnabled: true,
                isActive: true,
                isDeprecated: false,
              },
            }),
            'eip155:3': createMockNetworkConfig({
              chainId: 'eip155:3',
              config: {
                isAutoEnabled: false,
                isActive: true,
                isDeprecated: false,
              },
            }),
            'eip155:4': createMockNetworkConfig({
              chainId: 'eip155:4',
              config: {
                isAutoEnabled: true,
                isActive: false,
                isDeprecated: false,
              },
            }),
            'eip155:5': createMockNetworkConfig({
              chainId: 'eip155:5',
              config: {
                isAutoEnabled: true,
                isActive: true,
                isDeprecated: true,
              },
            }),
            'eip155:6': createMockNetworkConfig({
              chainId: 'eip155:6',
              config: {
                isAutoEnabled: true,
                isActive: true,
                isDeprecated: false,
              },
            }),
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': createMockNetworkConfig({
              chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              config: {
                isAutoEnabled: true,
                isActive: true,
                isDeprecated: false,
              },
            }),
          },
        },
        version: '1.0.0',
        lastFetched: Date.now(),
        etag: null,
      };

      const result = selectEvmAutoEnabledNetworksChainIds(state);
      expect(result).toStrictEqual(['eip155:1', 'eip155:6']);
    });

    it('returns the same array reference when the chain IDs have not changed', () => {
      const networks = {
        'eip155:1': createMockNetworkConfig({
          chainId: 'eip155:1',
          config: { isAutoEnabled: true, isActive: true, isDeprecated: false },
        }),
      };
      const state: ConfigRegistryControllerState = {
        configs: { networks },
        version: '1.0.0',
        lastFetched: 1,
        etag: null,
      };

      const first = selectEvmAutoEnabledNetworksChainIds(state);
      // Unrelated state change, same `networks` object.
      const second = selectEvmAutoEnabledNetworksChainIds({
        ...state,
        lastFetched: 2,
      });
      // New `networks` object with the same auto-enabled chain IDs.
      const third = selectEvmAutoEnabledNetworksChainIds({
        ...state,
        configs: { networks: { ...networks } },
      });

      expect(second).toBe(first);
      expect(third).toBe(first);
    });
  });
});
