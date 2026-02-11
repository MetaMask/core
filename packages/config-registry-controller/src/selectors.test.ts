import { selectFeaturedNetworks, selectNetworks } from './selectors';
import { createMockNetworkConfig } from './test-helpers';

describe('selectors', () => {
  describe('selectNetworks', () => {
    it('returns all networks from state', () => {
      const networks = {
        '0x1': createMockNetworkConfig({ chainId: '0x1' }),
        '0x89': createMockNetworkConfig({
          chainId: '0x89',
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
        '0x1': createMockNetworkConfig({
          chainId: '0x1',
          isFeatured: true,
          isActive: true,
          isTestnet: false,
        }),
        '0x5': createMockNetworkConfig({
          chainId: '0x5',
          name: 'Goerli',
          isFeatured: true,
          isActive: true,
          isTestnet: true,
        }),
        '0xa': createMockNetworkConfig({
          chainId: '0xa',
          name: 'Optimism',
          isFeatured: false,
          isActive: true,
          isTestnet: false,
        }),
        '0x89': createMockNetworkConfig({
          chainId: '0x89',
          name: 'Polygon',
          isFeatured: true,
          isActive: false,
          isTestnet: false,
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
      expect(featured['0x1']).toBeDefined();
      expect(featured['0x5']).toBeUndefined();
      expect(featured['0xa']).toBeUndefined();
      expect(featured['0x89']).toBeUndefined();
    });

    it('returns empty object when no networks match', () => {
      const networks = {
        '0x5': createMockNetworkConfig({
          chainId: '0x5',
          isTestnet: true,
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
});
