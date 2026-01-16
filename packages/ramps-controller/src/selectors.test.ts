import type { RampsControllerState } from './RampsController';
import {
  createLoadingState,
  createSuccessState,
  createErrorState,
} from './RequestCache';
import { createRequestSelector } from './selectors';

type TestRootState = {
  ramps: RampsControllerState;
};

describe('createRequestSelector', () => {
  const getState = (state: TestRootState): RampsControllerState => state.ramps;

  describe('basic functionality', () => {
    it('returns correct structure for loading state', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const loadingRequest = createLoadingState();
      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': loadingRequest,
          },
        },
      };

      const result = selector(state);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "data": null,
          "error": null,
          "isFetching": true,
        }
      `);
    });

    it('returns correct structure for success state', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const successRequest = createSuccessState(['ETH', 'BTC'], Date.now());
      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': successRequest,
          },
        },
      };

      const result = selector(state);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "data": Array [
            "ETH",
            "BTC",
          ],
          "error": null,
          "isFetching": false,
        }
      `);
    });

    it('returns correct structure for error state', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const errorRequest = createErrorState('Network error', Date.now());
      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': errorRequest,
          },
        },
      };

      const result = selector(state);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "data": null,
          "error": "Network error",
          "isFetching": false,
        }
      `);
    });

    it('returns null data when request is missing', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {},
        },
      };

      const result = selector(state);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "data": null,
          "error": null,
          "isFetching": false,
        }
      `);
    });

    it('returns null data when controller state is undefined', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const state: TestRootState = {
        ramps: undefined as unknown as RampsControllerState,
      };

      const result = selector(state);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "data": null,
          "error": null,
          "isFetching": false,
        }
      `);
    });
  });

  describe('memoization', () => {
    it('returns same object reference when request has not changed', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const successRequest = createSuccessState(['ETH', 'BTC'], Date.now());
      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': successRequest,
          },
        },
      };

      const result1 = selector(state);
      const result2 = selector(state);

      expect(result1).toBe(result2);
    });

    it('returns new object reference when request changes', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const successRequest1 = createSuccessState(['ETH'], Date.now());
      const state1: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': successRequest1,
          },
        },
      };

      const result1 = selector(state1);

      const successRequest2 = createSuccessState(['ETH', 'BTC'], Date.now());
      const state2: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': successRequest2,
          },
        },
      };

      const result2 = selector(state2);

      expect(result1).not.toBe(result2);
      expect(result2.data).toStrictEqual(['ETH', 'BTC']);
    });

    it('handles array data correctly without deep equality issues', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const largeArray = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
      const successRequest = createSuccessState(largeArray, Date.now());
      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': successRequest,
          },
        },
      };

      const result1 = selector(state);
      const result2 = selector(state);

      expect(result1).toBe(result2);
      expect(result1.data).toHaveLength(1000);
    });

    it('handles object data correctly', () => {
      const selector = createRequestSelector<
        TestRootState,
        { items: string[] }
      >(getState, 'getData', []);

      const complexData = {
        items: ['a', 'b', 'c'],
        metadata: { count: 3 },
      };
      const successRequest = createSuccessState(complexData, Date.now());
      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getData:[]': successRequest,
          },
        },
      };

      const result1 = selector(state);
      const result2 = selector(state);

      expect(result1).toBe(result2);
      expect(result1.data).toStrictEqual(complexData);
    });
  });

  describe('state transitions', () => {
    it('updates result when transitioning from loading to success', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const loadingRequest = createLoadingState();
      const loadingState: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': loadingRequest,
          },
        },
      };

      const loadingResult = selector(loadingState);
      expect(loadingResult.isFetching).toBe(true);
      expect(loadingResult.data).toBeNull();

      const successRequest = createSuccessState(['ETH'], Date.now());
      const successState: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': successRequest,
          },
        },
      };

      const successResult = selector(successState);
      expect(successResult.isFetching).toBe(false);
      expect(successResult.data).toStrictEqual(['ETH']);
    });

    it('updates result when transitioning from success to error', () => {
      const selector = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );

      const successRequest = createSuccessState(['ETH'], Date.now());
      const successState: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': successRequest,
          },
        },
      };

      const successResult = selector(successState);
      expect(successResult.error).toBeNull();

      const errorRequest = createErrorState('Failed to fetch', Date.now());
      const errorState: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': errorRequest,
          },
        },
      };

      const errorResult = selector(errorState);
      expect(errorResult.error).toBe('Failed to fetch');
      expect(errorResult.data).toBeNull();
    });
  });

  describe('cache key isolation', () => {
    it('returns different results for different methods', () => {
      const selector1 = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );
      const selector2 = createRequestSelector<TestRootState, number>(
        getState,
        'getPrice',
        ['US'],
      );

      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': createSuccessState(
              ['ETH'],
              Date.now(),
            ),
            'getPrice:["US"]': createSuccessState(100, Date.now()),
          },
        },
      };

      const result1 = selector1(state);
      const result2 = selector2(state);

      expect(result1.data).toStrictEqual(['ETH']);
      expect(result2.data).toBe(100);
    });

    it('returns different results for different params', () => {
      const selector1 = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['US'],
      );
      const selector2 = createRequestSelector<TestRootState, string[]>(
        getState,
        'getCryptoCurrencies',
        ['CA'],
      );

      const state: TestRootState = {
        ramps: {
          userRegion: null,
          preferredProvider: null,
          tokens: null,
          requests: {
            'getCryptoCurrencies:["US"]': createSuccessState(
              ['ETH'],
              Date.now(),
            ),
            'getCryptoCurrencies:["CA"]': createSuccessState(
              ['BTC'],
              Date.now(),
            ),
          },
        },
      };

      const result1 = selector1(state);
      const result2 = selector2(state);

      expect(result1.data).toStrictEqual(['ETH']);
      expect(result2.data).toStrictEqual(['BTC']);
    });
  });
});
