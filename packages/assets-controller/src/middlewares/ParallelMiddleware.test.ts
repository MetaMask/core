import type { AssetsDataSource, ChainId } from '../types.js';
import type { Context, DataResponse } from '../types.js';
import {
  createParallelBalanceMiddleware,
  createParallelMiddleware,
} from './ParallelMiddleware.js';

const MOCK_ASSET = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function createMockContext(overrides?: Partial<Context>): Context {
  return {
    request: {
      chainIds: ['eip155:1'],
      accountsWithSupportedChains: [],
      dataTypes: ['balance', 'metadata', 'price'],
    },
    response: {},
    ...overrides,
  };
}

function createMockSource(
  name: string,
  response: DataResponse,
): AssetsDataSource {
  return {
    getName: () => name,
    assetsMiddleware: async (ctx, next): Promise<Context> => {
      return next({
        ...ctx,
        response: { ...ctx.response, ...response },
      });
    },
  };
}

/**
 * Creates a tracker that records how many source calls are in flight at once.
 *
 * @returns Helpers to wrap a source call and read the observed peak.
 */
function createConcurrencyTracker(): {
  track: () => Promise<void>;
  getMaxInFlight: () => number;
  getCallCount: () => number;
} {
  let inFlight = 0;
  let maxInFlight = 0;
  let callCount = 0;

  return {
    track: async (): Promise<void> => {
      callCount += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    },
    getMaxInFlight: (): number => maxInFlight,
    getCallCount: (): number => callCount,
  };
}

describe('createParallelBalanceMiddleware', () => {
  it('runs at most 3 balance sources at the same time', async () => {
    const tracker = createConcurrencyTracker();
    const chainIds: ChainId[] = [
      'eip155:1',
      'eip155:10',
      'eip155:56',
      'eip155:137',
      'eip155:8453',
    ];
    const sources = chainIds.map((chainId) => ({
      getName: (): string => `Source-${chainId}`,
      getActiveChainsSync: (): ChainId[] => [chainId],
      assetsMiddleware: async (
        ctx: Context,
        next: (ctx: Context) => Promise<Context>,
      ): Promise<Context> => {
        await tracker.track();
        return next(ctx);
      },
    }));
    const middleware = createParallelBalanceMiddleware(sources);
    const context = createMockContext({
      request: {
        chainIds,
        accountsWithSupportedChains: [],
        dataTypes: ['balance'],
      },
    });

    await middleware.assetsMiddleware(context, async (ctx) => ctx);

    expect(tracker.getCallCount()).toBe(5);
    expect(tracker.getMaxInFlight()).toBe(3);
  });
});

describe('createParallelMiddleware', () => {
  describe('getName', () => {
    it('returns ParallelMiddleware', () => {
      const middleware = createParallelMiddleware([]);
      expect(middleware.getName()).toBe('ParallelMiddleware');
    });
  });

  describe('assetsMiddleware', () => {
    it('calls next with same context when sources array is empty', async () => {
      const middleware = createParallelMiddleware([]);
      const context = createMockContext();
      const next = jest.fn().mockResolvedValue(context);

      await middleware.assetsMiddleware(context, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(context);
    });

    it('runs at most 2 sources at the same time', async () => {
      const tracker = createConcurrencyTracker();
      const sources = [1, 2, 3, 4, 5].map((index) => ({
        getName: (): string => `Source${index}`,
        assetsMiddleware: async (
          ctx: Context,
          next: (ctx: Context) => Promise<Context>,
        ): Promise<Context> => {
          await tracker.track();
          return next(ctx);
        },
      }));
      const middleware = createParallelMiddleware(sources);

      await middleware.assetsMiddleware(
        createMockContext(),
        async (ctx) => ctx,
      );

      expect(tracker.getCallCount()).toBe(5);
      expect(tracker.getMaxInFlight()).toBe(2);
    });

    it('runs multiple sources in parallel and merges responses', async () => {
      const tokenSource = createMockSource('TokenSource', {
        assetsInfo: {
          [MOCK_ASSET]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
      });
      const priceSource = createMockSource('PriceSource', {
        assetsPrice: {
          [MOCK_ASSET]: {
            price: 1.0,
            lastUpdated: Date.now(),
          },
        },
      });

      const middleware = createParallelMiddleware([tokenSource, priceSource]);
      const context = createMockContext();
      const next = jest.fn().mockImplementation((ctx: Context) => {
        return Promise.resolve(ctx);
      });

      const result = await middleware.assetsMiddleware(context, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(result.response.assetsInfo).toHaveProperty(MOCK_ASSET);
      expect(result.response.assetsInfo?.[MOCK_ASSET]).toMatchObject({
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
      });
      expect(result.response.assetsPrice).toHaveProperty(MOCK_ASSET);
      expect(result.response.assetsPrice?.[MOCK_ASSET]).toMatchObject({
        price: 1.0,
      });
    });

    it('merges with existing context.response', async () => {
      const source = createMockSource('Single', {
        assetsInfo: {
          [MOCK_ASSET]: { type: 'erc20', symbol: 'T', name: 'T', decimals: 18 },
        },
      });
      const middleware = createParallelMiddleware([source]);
      const context = createMockContext({
        response: {
          assetsBalance: {
            'account-1': { [MOCK_ASSET]: { balance: '100' as `${number}` } },
          },
        },
      });
      const next = jest
        .fn()
        .mockImplementation((ctx: Context) => Promise.resolve(ctx));

      const result = await middleware.assetsMiddleware(context, next);

      expect(result.response.assetsBalance).toStrictEqual(
        context.response.assetsBalance,
      );
      expect(result.response.assetsInfo).toHaveProperty(MOCK_ASSET);
    });

    it('attaches durationByDataSource with latency per source', async () => {
      const tokenSource = createMockSource('TokenDataSource', {
        assetsInfo: {
          [MOCK_ASSET]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
      });
      const priceSource = createMockSource('PriceDataSource', {
        assetsPrice: {
          [MOCK_ASSET]: {
            price: 1.0,
            lastUpdated: Date.now(),
          },
        },
      });
      const middleware = createParallelMiddleware([tokenSource, priceSource]);
      const context = createMockContext();
      const next = jest
        .fn()
        .mockImplementation((ctx: Context) => Promise.resolve(ctx));

      const result = await middleware.assetsMiddleware(context, next);

      expect(result.durationByDataSource).toBeDefined();
      expect(result.durationByDataSource).toStrictEqual(
        expect.objectContaining({
          'ParallelMiddleware.TokenDataSource': expect.any(Number),
          'ParallelMiddleware.PriceDataSource': expect.any(Number),
        }),
      );
    });
  });
});
