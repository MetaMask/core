import { handleFetch } from '@metamask/controller-utils';

import { getSlip44ByChainId, getNativeCaip19 } from './ChainService';

// Mock slip44 data - intentionally exclude BTC to test COMMON_SYMBOL_DEFAULTS fallback
jest.mock('@metamask/slip44/slip44.json', () => ({
  __esModule: true,
  default: [
    { index: 60, symbol: 'ETH', name: 'Ethereum' },
    { index: 714, symbol: 'BNB', name: 'BNB' },
    { index: 966, symbol: 'MATIC', name: 'Polygon' },
    { index: 966, symbol: 'POL', name: 'Polygon' },
    { index: 9000, symbol: 'AVAX', name: 'Avalanche' },
    { index: 1007, symbol: 'FTM', name: 'Fantom' },
    { index: 700, symbol: 'XDAI', name: 'xDai' },
    // Intentionally omit BTC, SOL, SEI, MON to test COMMON_SYMBOL_DEFAULTS
  ],
}));

jest.mock('@metamask/controller-utils', () => ({
  handleFetch: jest.fn(),
}));

const mockHandleFetch = handleFetch as jest.MockedFunction<typeof handleFetch>;

describe('ChainService', () => {
  beforeAll(() => {
    // Use fake timers to control Date.now
    jest.useFakeTimers();
    // Set initial time to a large value
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  beforeEach(() => {
    // Clear mocks
    mockHandleFetch.mockClear();

    // Advance time by 2 hours to expire any cached data from previous tests
    // This is much more than the 30-minute cache duration
    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
  });

  afterAll(() => {
    // Restore real timers
    jest.useRealTimers();
  });

  describe('getSlip44ByChainId', () => {
    const mockChains = [
      {
        chainId: 1,
        name: 'Ethereum Mainnet',
        nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
      },
      {
        chainId: 56,
        name: 'Binance Smart Chain',
        nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
      },
      {
        chainId: 137,
        name: 'Polygon',
        nativeCurrency: { symbol: 'POL', name: 'POL', decimals: 18 },
      },
      {
        chainId: 42161,
        name: 'Arbitrum One',
        nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
      },
      {
        chainId: 43114,
        name: 'Avalanche C-Chain',
        nativeCurrency: { symbol: 'AVAX', name: 'Avalanche', decimals: 18 },
      },
    ];

    it('returns the slip44 value for Ethereum mainnet', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(1);

      expect(result).toBe('60');
      expect(mockHandleFetch).toHaveBeenCalledWith(
        'https://chainid.network/chains.json',
      );
    });

    it('returns the slip44 value for BNB Chain based on symbol', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(56);

      expect(result).toBe('714');
    });

    it('returns the slip44 value for Polygon based on symbol', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(137);

      expect(result).toBe('966');
    });

    it('returns ETH slip44 for Arbitrum (L2 with ETH)', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(42161);

      expect(result).toBe('60');
    });

    it('returns the slip44 value for Avalanche based on symbol', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(43114);

      expect(result).toBe('9000');
    });

    it('returns default ETH slip44 for unknown chain (L2 heuristic)', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(999999);

      expect(result).toBe('60');
    });

    it('returns default ETH slip44 when chain has no native currency', async () => {
      mockHandleFetch.mockResolvedValueOnce([
        { chainId: 12345, name: 'Test Chain' },
      ]);

      const result = await getSlip44ByChainId(12345);

      expect(result).toBe('60');
    });

    it('returns null and logs error when fetch fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockHandleFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getSlip44ByChainId(1);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'getSlip44ByChainId(1) failed:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('uses cached data on subsequent calls within cache duration', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      // First call - should fetch
      const result1 = await getSlip44ByChainId(1);
      expect(result1).toBe('60');
      expect(mockHandleFetch).toHaveBeenCalledTimes(1);

      // Second call within cache duration - should use cache
      jest.advanceTimersByTime(15 * 60 * 1000); // 15 minutes later
      const result2 = await getSlip44ByChainId(56);
      expect(result2).toBe('714');
      expect(mockHandleFetch).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('fetches new data when cache expires', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      // First call - should fetch
      const result1 = await getSlip44ByChainId(1);
      expect(result1).toBe('60');
      expect(mockHandleFetch).toHaveBeenCalledTimes(1);

      // Second call after cache expires - should fetch again
      jest.advanceTimersByTime(31 * 60 * 1000); // 31 minutes later
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result2 = await getSlip44ByChainId(1);
      expect(result2).toBe('60');
      expect(mockHandleFetch).toHaveBeenCalledTimes(2); // Called twice
    });

    it('handles multiple different chain IDs correctly', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      // All calls should use the same cached data from the first fetch
      const result1 = await getSlip44ByChainId(1);
      expect(mockHandleFetch).toHaveBeenCalledTimes(1);

      const result2 = await getSlip44ByChainId(56);
      expect(mockHandleFetch).toHaveBeenCalledTimes(1); // Still 1 - uses cache

      const result3 = await getSlip44ByChainId(137);
      expect(mockHandleFetch).toHaveBeenCalledTimes(1); // Still 1 - uses cache

      expect(result1).toBe('60');
      expect(result2).toBe('714');
      expect(result3).toBe('966');
    });

    it('handles chain with SOL symbol from COMMON_SYMBOL_DEFAULTS', async () => {
      mockHandleFetch.mockResolvedValueOnce([
        {
          chainId: 999001,
          name: 'Solana-based chain',
          nativeCurrency: { symbol: 'SOL', name: 'Solana', decimals: 9 },
        },
      ]);

      const result = await getSlip44ByChainId(999001);

      // SOL is not in mocked SLIP44_BY_SYMBOL but is in COMMON_SYMBOL_DEFAULTS
      expect(result).toBe('501');
      expect(typeof result).toBe('string');
    });

    it('handles invalid chains.json response', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockHandleFetch.mockResolvedValueOnce('invalid data');

      const result = await getSlip44ByChainId(1);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('handles empty chains array', async () => {
      mockHandleFetch.mockResolvedValueOnce([]);

      const result = await getSlip44ByChainId(1);

      // Should return default ETH slip44
      expect(result).toBe('60');
    });

    it('handles chains with uppercase and lowercase symbols', async () => {
      mockHandleFetch.mockResolvedValueOnce([
        {
          chainId: 1,
          name: 'Test Chain',
          nativeCurrency: { symbol: 'eth', name: 'Ether', decimals: 18 },
        },
      ]);

      const result = await getSlip44ByChainId(1);

      expect(result).toBe('60');
    });

    it('deduplicates concurrent requests (in-flight handling)', async () => {
      mockHandleFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            // Simulate slow network request
            setTimeout(() => {
              resolve([
                {
                  chainId: 1,
                  name: 'Ethereum Mainnet',
                  nativeCurrency: {
                    symbol: 'ETH',
                    name: 'Ether',
                    decimals: 18,
                  },
                },
              ]);
            }, 100);
          }),
      );

      // Make multiple concurrent requests
      const promise1 = getSlip44ByChainId(1);
      const promise2 = getSlip44ByChainId(1);
      const promise3 = getSlip44ByChainId(1);

      // Advance timers to resolve the promises
      jest.advanceTimersByTime(100);

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      // All should return the same result
      expect(result1).toBe('60');
      expect(result2).toBe('60');
      expect(result3).toBe('60');

      // But fetch should only be called once
      expect(mockHandleFetch).toHaveBeenCalledTimes(1);
    });

    it('uses COMMON_SYMBOL_DEFAULTS when symbol not in SLIP44_BY_SYMBOL', async () => {
      mockHandleFetch.mockResolvedValueOnce([
        {
          chainId: 999,
          name: 'Test Chain',
          // Use a symbol that's in COMMON_SYMBOL_DEFAULTS but not in mocked SLIP44
          nativeCurrency: { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
        },
      ]);

      const result = await getSlip44ByChainId(999);

      // Should find BTC in COMMON_SYMBOL_DEFAULTS
      expect(result).toBe('0');
    });
  });

  describe('getNativeCaip19', () => {
    const mockChains = [
      {
        chainId: 1,
        name: 'Ethereum Mainnet',
        nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
      },
      {
        chainId: 56,
        name: 'Binance Smart Chain',
        nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
      },
      {
        chainId: 137,
        name: 'Polygon',
        nativeCurrency: { symbol: 'POL', name: 'POL', decimals: 18 },
      },
    ];

    it('returns CAIP-19 format for Ethereum', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getNativeCaip19(1);

      expect(result).toBe('eip155:1/slip44:60');
    });

    it('returns CAIP-19 format for BNB Chain', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getNativeCaip19(56);

      expect(result).toBe('eip155:56/slip44:714');
    });

    it('returns null when getSlip44ByChainId fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockHandleFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getNativeCaip19(1);

      expect(result).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });
});
