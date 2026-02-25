import { fetchWithErrorHandling } from '@metamask/controller-utils';

import { Slip44Service } from './Slip44Service';

jest.mock('@metamask/controller-utils', () => ({
  fetchWithErrorHandling: jest.fn(),
}));

const mockFetchWithErrorHandling =
  fetchWithErrorHandling as jest.MockedFunction<typeof fetchWithErrorHandling>;

describe('Slip44Service', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure clean state
    Slip44Service.clearCache();
    jest.clearAllMocks();
  });

  describe('getSlip44BySymbol', () => {
    it('returns 60 for ETH symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('ETH');
      expect(result).toBe(60);
    });

    it('returns 0 for BTC symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('BTC');
      expect(result).toBe(0);
    });

    it('returns 501 for SOL symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('SOL');
      expect(result).toBe(501);
    });

    it('returns 195 for TRX symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('TRX');
      expect(result).toBe(195);
    });

    it('returns 2 for LTC symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('LTC');
      expect(result).toBe(2);
    });

    it('returns 3 for DOGE symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('DOGE');
      expect(result).toBe(3);
    });

    it('returns undefined for unknown symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');
      expect(result).toBeUndefined();
    });

    it('is case-insensitive for symbols', () => {
      const lowerResult = Slip44Service.getSlip44BySymbol('eth');
      const upperResult = Slip44Service.getSlip44BySymbol('ETH');
      const mixedResult = Slip44Service.getSlip44BySymbol('Eth');

      expect(lowerResult).toBe(60);
      expect(upperResult).toBe(60);
      expect(mixedResult).toBe(60);
    });

    it('caches the result for repeated lookups', () => {
      // First lookup
      const firstResult = Slip44Service.getSlip44BySymbol('ETH');
      // Second lookup (should come from cache)
      const secondResult = Slip44Service.getSlip44BySymbol('ETH');

      expect(firstResult).toBe(60);
      expect(secondResult).toBe(60);
    });

    it('caches undefined for unknown symbols', () => {
      // First lookup
      const firstResult = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');
      // Second lookup (should come from cache)
      const secondResult = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');

      expect(firstResult).toBeUndefined();
      expect(secondResult).toBeUndefined();
    });

    it('returns coin type 1 for empty string (Testnet)', () => {
      // The SLIP-44 data has an entry with empty symbol for "Testnet (all coins)" at index 1
      const result = Slip44Service.getSlip44BySymbol('');
      expect(result).toBe(1);
    });
  });

  describe('clearCache', () => {
    it('clears the cache so lookups are performed again', () => {
      // Perform initial lookup to populate cache
      Slip44Service.getSlip44BySymbol('ETH');

      // Clear the cache
      Slip44Service.clearCache();

      // Perform another lookup - should work correctly
      const result = Slip44Service.getSlip44BySymbol('ETH');
      expect(result).toBe(60);
    });

    it('clears cached undefined values', () => {
      // Perform initial lookup for unknown symbol
      Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');

      // Clear the cache
      Slip44Service.clearCache();

      // Verify cache is cleared (no error thrown)
      const result = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');
      expect(result).toBeUndefined();
    });
  });

  describe('real-world network symbols', () => {
    it('correctly maps common EVM network native currencies', () => {
      // All EVM networks use ETH or similar tokens with coin type 60
      expect(Slip44Service.getSlip44BySymbol('ETH')).toBe(60);
    });

    it('correctly maps Polygon MATIC symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('MATIC');
      // MATIC has coin type 966
      expect(result).toBe(966);
    });

    it('correctly maps BNB symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('BNB');
      // BNB has coin type 714
      expect(result).toBe(714);
    });
  });

  describe('getEvmSlip44', () => {
    it('returns slip44 from chainid.network data when available', async () => {
      // Mock chainid.network response with Ethereum data
      mockFetchWithErrorHandling.mockResolvedValueOnce([
        { chainId: 1, slip44: 60 },
        { chainId: 56, slip44: 714 },
      ]);

      const result = await Slip44Service.getEvmSlip44(1);

      expect(result).toBe(60);
      expect(mockFetchWithErrorHandling).toHaveBeenCalledWith({
        url: 'https://chainid.network/chains.json',
        timeout: 10000,
      });
    });

    it('returns cached value on subsequent calls without re-fetching', async () => {
      // Mock chainid.network response
      mockFetchWithErrorHandling.mockResolvedValueOnce([
        { chainId: 1, slip44: 60 },
        { chainId: 56, slip44: 714 },
      ]);

      // First call - fetches data
      const result1 = await Slip44Service.getEvmSlip44(1);
      // Second call - should use cache (line 144)
      const result2 = await Slip44Service.getEvmSlip44(56);

      expect(result1).toBe(60);
      expect(result2).toBe(714);
      // Should only fetch once
      expect(mockFetchWithErrorHandling).toHaveBeenCalledTimes(1);
    });

    it('handles concurrent calls by reusing the fetch promise (line 82)', async () => {
      // Mock chainid.network response with a delay
      mockFetchWithErrorHandling.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve([{ chainId: 1, slip44: 60 }]);
            }, 10);
          }),
      );

      // Make concurrent calls
      const [result1, result2, result3] = await Promise.all([
        Slip44Service.getEvmSlip44(1),
        Slip44Service.getEvmSlip44(1),
        Slip44Service.getEvmSlip44(1),
      ]);

      expect(result1).toBe(60);
      expect(result2).toBe(60);
      expect(result3).toBe(60);
      // Should only fetch once despite concurrent calls
      expect(mockFetchWithErrorHandling).toHaveBeenCalledTimes(1);
    });

    it('defaults to 60 when chainId not found in cache', async () => {
      // Mock chainid.network response without the requested chainId
      mockFetchWithErrorHandling.mockResolvedValueOnce([
        { chainId: 1, slip44: 60 },
      ]);

      // Request a chainId not in the response
      const result = await Slip44Service.getEvmSlip44(12345);

      expect(result).toBe(60); // Defaults to 60 (Ethereum)
    });

    it('handles invalid response by initializing empty cache and defaults to 60', async () => {
      // Mock invalid response (not an array)
      mockFetchWithErrorHandling.mockResolvedValueOnce('invalid response');

      // Should not throw, defaults to 60
      const result = await Slip44Service.getEvmSlip44(1);

      expect(result).toBe(60);
    });

    it('handles null response by initializing empty cache and defaults to 60', async () => {
      // Mock null response
      mockFetchWithErrorHandling.mockResolvedValueOnce(null);

      // Should not throw, defaults to 60
      const result = await Slip44Service.getEvmSlip44(1);

      expect(result).toBe(60);
    });

    it('handles network error by initializing empty cache and defaults to 60', async () => {
      // Mock network error
      mockFetchWithErrorHandling.mockRejectedValueOnce(
        new Error('Network error'),
      );

      // Should not throw, defaults to 60
      const result = await Slip44Service.getEvmSlip44(1);

      expect(result).toBe(60);
    });

    it('returns override value for HyperEVM (chain 999) instead of chainid.network data', async () => {
      // chainid.network returns slip44:1 for chain 999 (Wanchain collision)
      mockFetchWithErrorHandling.mockResolvedValueOnce([
        { chainId: 999, slip44: 1 },
      ]);

      const result = await Slip44Service.getEvmSlip44(999);

      expect(result).toBe(2457);
    });

    it('returns override value for HyperEVM without fetching chainid.network', async () => {
      const result = await Slip44Service.getEvmSlip44(999);

      expect(result).toBe(2457);
      expect(mockFetchWithErrorHandling).not.toHaveBeenCalled();
    });

    it('filters out entries without slip44 field and defaults to 60', async () => {
      // Mock response with some entries missing slip44
      mockFetchWithErrorHandling.mockResolvedValueOnce([
        { chainId: 1, slip44: 60 },
        { chainId: 2 }, // No slip44 field
        { chainId: 3, slip44: undefined }, // Explicit undefined
        { chainId: 56, slip44: 714 },
      ]);

      const result1 = await Slip44Service.getEvmSlip44(1);
      const result2 = await Slip44Service.getEvmSlip44(2);
      const result3 = await Slip44Service.getEvmSlip44(3);
      const result56 = await Slip44Service.getEvmSlip44(56);

      expect(result1).toBe(60);
      expect(result2).toBe(60); // Not in cache, defaults to 60
      expect(result3).toBe(60); // Not in cache, defaults to 60
      expect(result56).toBe(714);
    });
  });
});
