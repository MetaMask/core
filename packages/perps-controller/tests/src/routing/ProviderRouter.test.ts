/* eslint-disable */
import { ProviderRouter } from '../../../src/routing/ProviderRouter.js';

describe('ProviderRouter', () => {
  let router: ProviderRouter;

  beforeEach(() => {
    router = new ProviderRouter({ defaultProvider: 'hyperliquid' });
  });

  describe('constructor', () => {
    it('sets default provider from options', () => {
      const customRouter = new ProviderRouter({ defaultProvider: 'lighter' });
      expect(customRouter.getDefaultProvider()).toBe('lighter');
    });

    it('sets default strategy to default_provider', () => {
      expect(router.getStrategy()).toBe('default_provider');
    });

    it('accepts custom strategy', () => {
      const customRouter = new ProviderRouter({
        defaultProvider: 'hyperliquid',
        strategy: 'default_provider',
      });
      expect(customRouter.getStrategy()).toBe('default_provider');
    });
  });

  describe('selectProvider', () => {
    it('returns explicit providerId when provided', () => {
      const result = router.selectProvider({ providerId: 'lighter' });
      expect(result).toBe('lighter');
    });

    it('returns explicit providerId even when symbol is provided', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC', 'ETH']);
      const result = router.selectProvider({
        symbol: 'BTC',
        providerId: 'lighter',
      });
      expect(result).toBe('lighter');
    });

    it('returns default provider when no providerId is specified', () => {
      const result = router.selectProvider({ symbol: 'BTC' });
      expect(result).toBe('hyperliquid');
    });

    it('returns default provider when params are empty', () => {
      const result = router.selectProvider({});
      expect(result).toBe('hyperliquid');
    });

    it('uses specified provider when provided', () => {
      const result = router.selectProvider({ providerId: 'lighter' });
      expect(result).toBe('lighter');
    });
  });

  describe('getProvidersForMarket', () => {
    beforeEach(() => {
      router.updateProviderMarkets('hyperliquid', ['BTC', 'ETH', 'SOL']);
      router.updateProviderMarkets('lighter', ['BTC', 'ETH', 'ARB']);
    });

    it('returns all providers that support a market', () => {
      const providers = router.getProvidersForMarket('BTC');
      expect(providers).toContain('hyperliquid');
      expect(providers).toContain('lighter');
      expect(providers).toHaveLength(2);
    });

    it('returns single provider for exclusive market', () => {
      const providers = router.getProvidersForMarket('SOL');
      expect(providers).toEqual(['hyperliquid']);
    });

    it('returns empty array for unknown market', () => {
      const providers = router.getProvidersForMarket('UNKNOWN');
      expect(providers).toEqual([]);
    });
  });

  describe('updateProviderMarkets', () => {
    it('adds markets for a provider', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC', 'ETH']);

      expect(router.providerSupportsMarket('hyperliquid', 'BTC')).toBe(true);
      expect(router.providerSupportsMarket('hyperliquid', 'ETH')).toBe(true);
      expect(router.providerSupportsMarket('hyperliquid', 'SOL')).toBe(false);
    });

    it('replaces existing markets when called again', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC', 'ETH']);
      router.updateProviderMarkets('hyperliquid', ['SOL', 'ARB']);

      expect(router.providerSupportsMarket('hyperliquid', 'BTC')).toBe(false);
      expect(router.providerSupportsMarket('hyperliquid', 'SOL')).toBe(true);
    });

    it('handles empty markets array', () => {
      router.updateProviderMarkets('hyperliquid', []);
      expect(router.providerSupportsMarket('hyperliquid', 'BTC')).toBe(false);
    });
  });

  describe('clearProviderMarkets', () => {
    it('removes all markets for a provider', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC', 'ETH']);
      router.clearProviderMarkets('hyperliquid');

      expect(router.providerSupportsMarket('hyperliquid', 'BTC')).toBe(false);
      expect(router.getProvidersForMarket('BTC')).toEqual([]);
    });

    it('does not affect other providers', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC']);
      router.updateProviderMarkets('lighter', ['BTC']);
      router.clearProviderMarkets('hyperliquid');

      expect(router.getProvidersForMarket('BTC')).toEqual(['lighter']);
    });
  });

  describe('setDefaultProvider', () => {
    it('updates the default provider', () => {
      router.setDefaultProvider('lighter');
      expect(router.getDefaultProvider()).toBe('lighter');
    });

    it('affects subsequent selectProvider calls', () => {
      router.setDefaultProvider('lighter');
      const result = router.selectProvider({ symbol: 'BTC' });
      expect(result).toBe('lighter');
    });
  });

  describe('providerSupportsMarket', () => {
    it('returns true when provider supports market', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC', 'ETH']);
      expect(router.providerSupportsMarket('hyperliquid', 'BTC')).toBe(true);
    });

    it('returns false when provider does not support market', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC', 'ETH']);
      expect(router.providerSupportsMarket('hyperliquid', 'SOL')).toBe(false);
    });

    it('returns false for unknown provider', () => {
      // @ts-expect-error Testing error handling with invalid provider type
      expect(router.providerSupportsMarket('unknown', 'BTC')).toBe(false);
    });
  });

  describe('getRegisteredProviders', () => {
    it('returns empty array when no providers registered', () => {
      expect(router.getRegisteredProviders()).toEqual([]);
    });

    it('returns all providers with registered markets', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC']);
      router.updateProviderMarkets('lighter', ['ETH']);

      const providers = router.getRegisteredProviders();
      expect(providers).toContain('hyperliquid');
      expect(providers).toContain('lighter');
      expect(providers).toHaveLength(2);
    });

    it('does not include cleared providers', () => {
      router.updateProviderMarkets('hyperliquid', ['BTC']);
      router.updateProviderMarkets('lighter', ['ETH']);
      router.clearProviderMarkets('hyperliquid');

      const providers = router.getRegisteredProviders();
      expect(providers).toEqual(['lighter']);
    });
  });
});
