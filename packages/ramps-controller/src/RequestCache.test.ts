import {
  RequestStatus,
  createCacheKey,
  isCacheExpired,
  createLoadingState,
  createSuccessState,
  createErrorState,
  DEFAULT_REQUEST_CACHE_TTL,
} from './RequestCache';

describe('RequestCache', () => {
  describe('createCacheKey', () => {
    it('creates a cache key from method and empty params', () => {
      const key = createCacheKey('updateUserRegion', []);
      expect(key).toBe('updateUserRegion:[]');
    });

    it('creates a cache key from method and params', () => {
      const key = createCacheKey('getCryptoCurrencies', ['US', 'USD']);
      expect(key).toBe('getCryptoCurrencies:["US","USD"]');
    });

    it('creates different keys for different params', () => {
      const key1 = createCacheKey('method', ['a']);
      const key2 = createCacheKey('method', ['b']);
      expect(key1).not.toBe(key2);
    });

    it('creates different keys for different methods', () => {
      const key1 = createCacheKey('methodA', []);
      const key2 = createCacheKey('methodB', []);
      expect(key1).not.toBe(key2);
    });

    it('handles complex params', () => {
      const key = createCacheKey('search', [
        { chainId: 1, symbol: 'ETH' },
        ['option1', 'option2'],
      ]);
      expect(key).toBe(
        'search:[{"chainId":1,"symbol":"ETH"},["option1","option2"]]',
      );
    });
  });

  describe('isCacheExpired', () => {
    it('returns true for loading state', () => {
      const state = createLoadingState();
      expect(isCacheExpired(state)).toBe(true);
    });

    it('returns true for error state', () => {
      const state = createErrorState('error', Date.now());
      expect(isCacheExpired(state)).toBe(true);
    });

    it('returns false for fresh success state', () => {
      const state = createSuccessState('data', Date.now());
      expect(isCacheExpired(state)).toBe(false);
    });

    it('returns true for expired success state', () => {
      const oldTimestamp = Date.now() - DEFAULT_REQUEST_CACHE_TTL - 1000;
      const state = {
        status: RequestStatus.SUCCESS,
        data: 'data',
        error: null,
        timestamp: oldTimestamp,
        lastFetchedAt: oldTimestamp,
      };
      expect(isCacheExpired(state)).toBe(true);
    });

    it('respects custom TTL', () => {
      const customTTL = 1000; // 1 second
      const recentTimestamp = Date.now() - 500; // 500ms ago
      const state = {
        status: RequestStatus.SUCCESS,
        data: 'data',
        error: null,
        timestamp: recentTimestamp,
        lastFetchedAt: recentTimestamp,
      };
      expect(isCacheExpired(state, customTTL)).toBe(false);

      const oldTimestamp = Date.now() - 2000; // 2 seconds ago
      const expiredState = {
        status: RequestStatus.SUCCESS,
        data: 'data',
        error: null,
        timestamp: oldTimestamp,
        lastFetchedAt: oldTimestamp,
      };
      expect(isCacheExpired(expiredState, customTTL)).toBe(true);
    });
  });

  describe('createLoadingState', () => {
    it('creates a loading state', () => {
      const state = createLoadingState();
      expect(state.status).toBe(RequestStatus.LOADING);
      expect(state.data).toBeNull();
      expect(state.error).toBeNull();
      expect(state.timestamp).toBeGreaterThan(0);
      expect(state.lastFetchedAt).toBeGreaterThan(0);
    });
  });

  describe('createSuccessState', () => {
    it('creates a success state with data', () => {
      const now = Date.now();
      const state = createSuccessState({ value: 42 }, now);
      expect(state.status).toBe(RequestStatus.SUCCESS);
      expect(state.data).toStrictEqual({ value: 42 });
      expect(state.error).toBeNull();
      expect(state.lastFetchedAt).toBe(now);
    });
  });

  describe('createErrorState', () => {
    it('creates an error state with message', () => {
      const now = Date.now();
      const state = createErrorState('Something went wrong', now);
      expect(state.status).toBe(RequestStatus.ERROR);
      expect(state.data).toBeNull();
      expect(state.error).toBe('Something went wrong');
      expect(state.lastFetchedAt).toBe(now);
    });
  });
});
