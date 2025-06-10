import {
  OnChainNotificationsCache,
  NotificationConfigCacheTTL,
} from './notification-config-cache';

describe('OnChainNotificationsCache', () => {
  // Create a fresh instance for each test to avoid interference
  let cache: OnChainNotificationsCache;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new OnChainNotificationsCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('get', () => {
    it('should return null when cache is empty', () => {
      const result = cache.get(['0x123']);
      expect(result).toBeNull();
    });

    it('should return null when cache is expired', () => {
      // Set some data
      cache.set([{ address: '0x123', enabled: true }]);

      // Fast-forward time past TTL
      jest.advanceTimersByTime(NotificationConfigCacheTTL + 1);

      const result = cache.get(['0x123']);
      expect(result).toBeNull();
    });

    it('should return null when not all requested addresses are in cache', () => {
      cache.set([{ address: '0x123', enabled: true }]);

      const result = cache.get(['0x123', '0x456']);
      expect(result).toBeNull();
    });

    it('should return cached data when all addresses are available and not expired', () => {
      const testData = [
        { address: '0x123', enabled: true },
        { address: '0x456', enabled: false },
      ];
      cache.set(testData);

      const result = cache.get(['0x123', '0x456']);
      expect(result).toStrictEqual(testData);
    });

    it('should return data in the order requested', () => {
      cache.set([
        { address: '0x123', enabled: true },
        { address: '0x456', enabled: false },
      ]);

      const result = cache.get(['0x456', '0x123']);
      expect(result).toStrictEqual([
        { address: '0x456', enabled: false },
        { address: '0x123', enabled: true },
      ]);
    });

    it('should return false for addresses not in cache when some addresses are cached', () => {
      cache.set([{ address: '0x123', enabled: true }]);

      // This should return null because not all addresses are cached
      const result = cache.get(['0x123', '0x456']);
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store data in cache', () => {
      const testData = [{ address: '0x123', enabled: true }];
      cache.set(testData);

      const result = cache.get(['0x123']);
      expect(result).toStrictEqual(testData);
    });

    it('should merge with existing non-expired cache data', () => {
      // Set initial data
      cache.set([{ address: '0x123', enabled: true }]);

      // Add more data (within TTL)
      jest.advanceTimersByTime(NotificationConfigCacheTTL / 2);
      cache.set([{ address: '0x456', enabled: false }]);

      const result = cache.get(['0x123', '0x456']);
      expect(result).toStrictEqual([
        { address: '0x123', enabled: true },
        { address: '0x456', enabled: false },
      ]);
    });

    it('should update existing addresses in cache', () => {
      // Set initial data
      cache.set([{ address: '0x123', enabled: true }]);

      // Update the same address
      cache.set([{ address: '0x123', enabled: false }]);

      const result = cache.get(['0x123']);
      expect(result).toStrictEqual([{ address: '0x123', enabled: false }]);
    });

    it('should not merge with expired cache data', () => {
      // Set initial data
      cache.set([{ address: '0x123', enabled: true }]);

      // Fast-forward time past TTL
      jest.advanceTimersByTime(NotificationConfigCacheTTL + 1);

      // Set new data
      cache.set([{ address: '0x456', enabled: false }]);

      // Should only have the new data, not the expired data
      const result = cache.get(['0x456']);
      expect(result).toStrictEqual([{ address: '0x456', enabled: false }]);

      const expiredResult = cache.get(['0x123']);
      expect(expiredResult).toBeNull();
    });

    it('should handle empty data array', () => {
      cache.set([]);

      const result = cache.get(['0x123']);
      expect(result).toBeNull();
    });
  });

  describe('replace', () => {
    it('should completely replace cache data', () => {
      // Set initial data
      cache.set([
        { address: '0x123', enabled: true },
        { address: '0x456', enabled: false },
      ]);

      // Replace with new data
      cache.replace([{ address: '0x789', enabled: true }]);

      // Old data should be gone
      const oldResult = cache.get(['0x123', '0x456']);
      expect(oldResult).toBeNull();

      // New data should be available
      const newResult = cache.get(['0x789']);
      expect(newResult).toStrictEqual([{ address: '0x789', enabled: true }]);
    });

    it('should handle empty replacement data', () => {
      // Set initial data
      cache.set([{ address: '0x123', enabled: true }]);

      // Replace with empty data
      cache.replace([]);

      const result = cache.get(['0x123']);
      expect(result).toBeNull();
    });

    it('should update timestamp on replace', () => {
      cache.replace([{ address: '0x123', enabled: true }]);

      // Should not be expired immediately
      const result = cache.get(['0x123']);
      expect(result).toStrictEqual([{ address: '0x123', enabled: true }]);

      // Should expire after TTL
      jest.advanceTimersByTime(NotificationConfigCacheTTL + 1);
      const expiredResult = cache.get(['0x123']);
      expect(expiredResult).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache data', () => {
      cache.set([{ address: '0x123', enabled: true }]);

      cache.clear();

      const result = cache.get(['0x123']);
      expect(result).toBeNull();
    });

    it('should handle clearing empty cache', () => {
      cache.clear();

      const result = cache.get(['0x123']);
      expect(result).toBeNull();
    });
  });

  describe('TTL behavior', () => {
    it('should respect TTL for cache expiration', () => {
      cache.set([{ address: '0x123', enabled: true }]);

      // Should be available immediately
      expect(cache.get(['0x123'])).toStrictEqual([
        { address: '0x123', enabled: true },
      ]);

      // Should still be available just before expiration
      jest.advanceTimersByTime(NotificationConfigCacheTTL / 2);
      expect(cache.get(['0x123'])).toStrictEqual([
        { address: '0x123', enabled: true },
      ]);

      // Should be expired after TTL
      jest.advanceTimersByTime(NotificationConfigCacheTTL);
      expect(cache.get(['0x123'])).toBeNull();
    });

    it('should handle multiple cache operations within TTL window', () => {
      // Set initial data
      cache.set([{ address: '0x123', enabled: true }]);

      // Advance under TTL
      jest.advanceTimersByTime(NotificationConfigCacheTTL / 2);

      // Add more data (should merge with existing)
      cache.set([{ address: '0x456', enabled: false }]);

      // Both should be available
      expect(cache.get(['0x123', '0x456'])).toStrictEqual([
        { address: '0x123', enabled: true },
        { address: '0x456', enabled: false },
      ]);

      // Advance past TTL
      jest.advanceTimersByTime(NotificationConfigCacheTTL + 1);

      // Cache should be expired now
      expect(cache.get(['0x123', '0x456'])).toBeNull();
    });

    it('should reset TTL on each cache operation', () => {
      // Set initial data
      cache.set([{ address: '0x123', enabled: true }]);

      // Advance under TTL (almost ended)
      jest.advanceTimersByTime(NotificationConfigCacheTTL * 0.9);

      // Update cache (should reset TTL)
      cache.set([{ address: '0x456', enabled: false }]);

      // Advance TTL (it should be past TTL, but cache was reset)
      jest.advanceTimersByTime(NotificationConfigCacheTTL * 0.9);

      // Should still be available because TTL was reset
      expect(cache.get(['0x123', '0x456'])).toStrictEqual([
        { address: '0x123', enabled: true },
        { address: '0x456', enabled: false },
      ]);

      // Advance past TTL (added from previous timer makes this past TTL)
      jest.advanceTimersByTime(NotificationConfigCacheTTL * 0.9);

      // Now should be expired
      expect(cache.get(['0x123', '0x456'])).toBeNull();
    });
  });
});
