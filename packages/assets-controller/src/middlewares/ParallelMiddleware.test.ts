import { createParallelMiddleware } from './ParallelMiddleware';
import type { TokenPriceSource } from './ParallelMiddleware';
import type { Context, DataResponse } from '../types';

const MOCK_ASSET = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function createMockContext(overrides?: Partial<Context>): Context {
  return {
    request: {
      chainIds: ['eip155:1'],
      accountsWithSupportedChains: [],
      dataTypes: ['balance', 'metadata', 'price'],
    },
    response: {},
    getAssetsState: jest.fn().mockReturnValue({
      assetsInfo: {},
      assetsBalance: {},
      customAssets: {},
    }),
    ...overrides,
  };
}

function createMockSource(
  name: string,
  response: DataResponse,
): TokenPriceSource {
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
  });
});
