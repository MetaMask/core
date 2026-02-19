import { CacheManager } from './CacheManager';
import * as utils from './utils';

describe('CacheManager', () => {
  let updateStateSpy: jest.Mock;
  let cache: CacheManager<{ value: string }>;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    jest
      .spyOn(utils, 'fetchTimeNow')
      .mockImplementation(() => Math.floor(Date.now() / 1000));
    updateStateSpy = jest.fn();
    cache = new CacheManager<{ value: string }>({
      cacheTTL: 300, // 5 minutes
      maxCacheSize: 3,
      updateState: updateStateSpy,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty cache when no initialCache provided', () => {
      const emptyCache = new CacheManager<{ value: string }>({
        // eslint-disable-next-line no-empty-function
        updateState: () => {},
      });
      expect(emptyCache.get('test-key')).toBeUndefined();
    });

    it('should initialize with provided initialCache data', () => {
      const now = Math.floor(Date.now() / 1000);
      const initialCache = {
        'test-key': {
          data: { value: 'test-value' },
          timestamp: now,
        },
      };

      const cacheWithInitialData = new CacheManager<{ value: string }>({
        initialCache,
        // eslint-disable-next-line no-empty-function
        updateState: () => {},
      });

      expect(cacheWithInitialData.get('test-key')).toStrictEqual({
        value: 'test-value',
      });
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeUndefined();
    });

    it('should return data for existing keys', () => {
      cache.set('key1', { value: 'value1' });
      expect(cache.get('key1')).toStrictEqual({ value: 'value1' });
    });

    it('should return undefined for expired entries', () => {
      cache.set('key1', { value: 'value1' });

      // Fast forward time past TTL
      jest.advanceTimersByTime(301 * 1000);

      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should add new entries', () => {
      cache.set('key1', { value: 'value1' });
      expect(cache.get('key1')).toStrictEqual({ value: 'value1' });
    });

    it('should update existing entries', () => {
      cache.set('key1', { value: 'value1' });
      cache.set('key1', { value: 'updated-value' });
      expect(cache.get('key1')).toStrictEqual({ value: 'updated-value' });
    });

    it('should call updateState when adding entries', () => {
      cache.set('key1', { value: 'value1' });
      expect(updateStateSpy).toHaveBeenCalledTimes(1);
    });

    it('should evict oldest entries when cache exceeds max size', () => {
      cache.set('key1', { value: 'value1' });
      cache.set('key2', { value: 'value2' });
      cache.set('key3', { value: 'value3' });
      cache.set('key4', { value: 'value4' }); // This should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toStrictEqual({ value: 'value2' });
      expect(cache.get('key3')).toStrictEqual({ value: 'value3' });
      expect(cache.get('key4')).toStrictEqual({ value: 'value4' });
    });
  });

  describe('delete', () => {
    it('should remove entries', () => {
      cache.set('key1', { value: 'value1' });
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return false when deleting non-existent keys', () => {
      expect(cache.delete('non-existent')).toBe(false);
    });

    it('should call updateState when deleting entries', () => {
      cache.set('key1', { value: 'value1' });
      updateStateSpy.mockClear();
      cache.delete('key1');
      expect(updateStateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', { value: 'value1' });
      cache.set('key2', { value: 'value2' });
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should call updateState', () => {
      cache.set('key1', { value: 'value1' });
      updateStateSpy.mockClear();
      cache.clear();
      expect(updateStateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('setTTL', () => {
    it('should update the TTL', () => {
      cache.setTTL(600);
      expect(cache.getTTL()).toBe(600);
    });
  });

  describe('setMaxSize', () => {
    it('should update the max size', () => {
      cache.setMaxSize(5);
      expect(cache.getMaxSize()).toBe(5);
    });

    it('should evict entries if new size is smaller than current cache size', () => {
      cache.set('key1', { value: 'value1' });
      cache.set('key2', { value: 'value2' });
      cache.set('key3', { value: 'value3' });
      cache.setMaxSize(2); // This should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toStrictEqual({ value: 'value2' });
      expect(cache.get('key3')).toStrictEqual({ value: 'value3' });
    });
  });

  describe('getSize', () => {
    it('should return the current cache size', () => {
      expect(cache.getSize()).toBe(0);
      cache.set('key1', { value: 'value1' });
      expect(cache.getSize()).toBe(1);
      cache.set('key2', { value: 'value2' });
      expect(cache.getSize()).toBe(2);
      cache.delete('key1');
      expect(cache.getSize()).toBe(1);
    });
  });

  describe('keys', () => {
    it('should return all cache keys', () => {
      cache.set('key1', { value: 'value1' });
      cache.set('key2', { value: 'value2' });
      expect(cache.keys()).toStrictEqual(['key1', 'key2']);
    });
  });

  describe('getAllEntries', () => {
    it('should return all cache entries', () => {
      const now = Math.floor(Date.now() / 1000);
      cache.set('key1', { value: 'value1' });
      cache.set('key2', { value: 'value2' });
      const entries = cache.getAllEntries();
      expect(Object.keys(entries)).toStrictEqual(['key1', 'key2']);
      expect(entries.key1.data).toStrictEqual({ value: 'value1' });
      expect(entries.key2.data).toStrictEqual({ value: 'value2' });
      expect(entries.key1.timestamp).toBeGreaterThanOrEqual(now);
      expect(entries.key2.timestamp).toBeGreaterThanOrEqual(now);
    });
  });
});
