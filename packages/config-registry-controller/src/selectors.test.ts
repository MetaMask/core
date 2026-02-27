import { selectFeaturedNetworks, selectNetworks } from './selectors';
import { createMockNetworkConfig } from '../tests/helpers';

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
});
