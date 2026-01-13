import { createThrottledFetch, createThrottledFetchForChainId } from './throttled-fetch';

describe('throttled-fetch', () => {
  describe('createThrottledFetch', () => {
    it('should delay fetch calls by the specified amount', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const delayMs = 100;
      const throttledFetch = createThrottledFetch(delayMs, mockFetch);

      const startTime = Date.now();
      await throttledFetch('https://example.com');
      const elapsedTime = Date.now() - startTime;

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', undefined);
      expect(elapsedTime).toBeGreaterThanOrEqual(delayMs - 10); // Allow small margin
    });

    it('should return the original fetch when delay is 0', () => {
      const mockFetch = jest.fn();
      const throttledFetch = createThrottledFetch(0, mockFetch);

      expect(throttledFetch).toBe(mockFetch);
    });

    it('should pass through all fetch arguments', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const throttledFetch = createThrottledFetch(10, mockFetch);

      const url = 'https://example.com';
      const init = { method: 'POST', body: '{}' };
      await throttledFetch(url, init);

      expect(mockFetch).toHaveBeenCalledWith(url, init);
    });
  });

  describe('createThrottledFetchForChainId', () => {
    it('should apply throttling for configured chain IDs', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const throttleConfig = {
        '0x2019': 100, // Klaytn with 100ms delay
      };

      const throttledFetch = createThrottledFetchForChainId(
        'https://klaytn-rpc.example.com',
        '0x2019',
        mockFetch,
        throttleConfig,
      );

      const startTime = Date.now();
      await throttledFetch('https://klaytn-rpc.example.com');
      const elapsedTime = Date.now() - startTime;

      expect(mockFetch).toHaveBeenCalled();
      expect(elapsedTime).toBeGreaterThanOrEqual(90); // Allow small margin
    });

    it('should not throttle unconfigured chain IDs', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      const throttleConfig = {
        '0x2019': 100,
      };

      const throttledFetch = createThrottledFetchForChainId(
        'https://mainnet.infura.io',
        '0x1', // Ethereum Mainnet - not configured for throttling
        mockFetch,
        throttleConfig,
      );

      expect(throttledFetch).toBe(mockFetch); // Should return original fetch
    });

    it('should use default throttle config when not provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });

      // Using default config which includes Klaytn (0x2019) with 2000ms delay
      const throttledFetch = createThrottledFetchForChainId(
        'https://klaytn-rpc.example.com',
        '0x2019',
        mockFetch,
      );

      const startTime = Date.now();
      await throttledFetch('https://klaytn-rpc.example.com');
      const elapsedTime = Date.now() - startTime;

      expect(mockFetch).toHaveBeenCalled();
      // Default config should have 2000ms for Klaytn
      expect(elapsedTime).toBeGreaterThanOrEqual(1900); // Allow margin
    });
  });
});
