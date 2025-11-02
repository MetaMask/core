import { handleFetch } from '@metamask/controller-utils';

import { getSlip44ByChainId } from './ChainService';

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
      { chainId: 1, slip44: 60, name: 'Ethereum Mainnet' },
      { chainId: 56, slip44: 714, name: 'Binance Smart Chain' },
      { chainId: 137, slip44: 966, name: 'Polygon' },
      { chainId: 42161, name: 'Arbitrum One' }, // No slip44
    ];

    it('returns the slip44 value as a string for a known chain', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(1);

      expect(result).toBe('60');
      expect(mockHandleFetch).toHaveBeenCalledWith(
        'https://chainid.network/chains.json',
      );
    });

    it('returns null for an unknown chain ID', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(999999);

      expect(result).toBeNull();
    });

    it('returns null when chain exists but slip44 is undefined', async () => {
      mockHandleFetch.mockResolvedValueOnce(mockChains);

      const result = await getSlip44ByChainId(42161);

      expect(result).toBeNull();
    });

    it('returns null and logs error when fetch fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockHandleFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getSlip44ByChainId(1);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching SLIP-44 for chainId 1:',
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

    it('converts slip44 number to string correctly', async () => {
      mockHandleFetch.mockResolvedValueOnce([
        { chainId: 1, slip44: 0, name: 'Test Chain' },
      ]);

      const result = await getSlip44ByChainId(1);

      expect(result).toBe('0');
      expect(typeof result).toBe('string');
    });

    it('handles non-Error objects in catch block', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockHandleFetch.mockRejectedValueOnce('String error');

      const result = await getSlip44ByChainId(1);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching SLIP-44 for chainId 1:',
        expect.objectContaining({
          message: 'Failed to fetch chain data: Unknown error',
        }),
      );

      consoleErrorSpy.mockRestore();
    });

    it('handles empty chains array', async () => {
      mockHandleFetch.mockResolvedValueOnce([]);

      const result = await getSlip44ByChainId(1);

      expect(result).toBeNull();
    });
  });
});
