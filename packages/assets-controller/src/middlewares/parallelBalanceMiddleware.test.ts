import { createParallelBalanceMiddleware } from './parallelBalanceMiddleware';
import type {
  Context,
  DataRequest,
  Caip19AssetId,
  AccountId,
  ChainId,
  AssetsControllerStateInternal,
} from '../types';

const MOCK_ACCOUNT_ID = 'mock-account-id' as AccountId;
const MOCK_CHAIN = 'eip155:1' as ChainId;
const MOCK_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;

function createDataRequest(overrides?: Partial<DataRequest>): DataRequest {
  return {
    chainIds: [MOCK_CHAIN],
    accountsWithSupportedChains: [],
    dataTypes: ['balance'],
    ...overrides,
  } as DataRequest;
}

function createContext(overrides?: Partial<Context>): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest.fn().mockReturnValue({
      assetsMetadata: {},
      assetsBalance: {},
      customAssets: {},
    } as AssetsControllerStateInternal),
    ...overrides,
  };
}

describe('createParallelBalanceMiddleware', () => {
  it('calls next with unchanged context when middlewares array is empty', async () => {
    const middleware = createParallelBalanceMiddleware([]);
    const context = createContext();
    const next = jest.fn().mockResolvedValue(context);

    await middleware(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(context);
  });

  it('merges responses from all middlewares and passes to next', async () => {
    const CHAIN_2 = 'eip155:137' as ChainId;
    const middlewareA = jest.fn(async (ctx: Context, next) => {
      ctx.response.assetsBalance = {
        [MOCK_ACCOUNT_ID]: {
          [MOCK_ASSET]: { amount: '100' },
        },
      };
      return next(ctx);
    });
    const middlewareB = jest.fn(async (ctx: Context, next) => {
      ctx.response.assetsBalance = {
        [MOCK_ACCOUNT_ID]: {
          ['eip155:137/slip44:60' as Caip19AssetId]: { amount: '200' },
        },
      };
      return next(ctx);
    });

    const parallel = createParallelBalanceMiddleware([
      { middleware: middlewareA, getActiveChains: () => [MOCK_CHAIN] },
      { middleware: middlewareB, getActiveChains: () => [CHAIN_2] },
    ]);
    const context = createContext({
      request: createDataRequest({ chainIds: [MOCK_CHAIN, CHAIN_2] }),
    });
    const next = jest.fn().mockImplementation((ctx: Context) =>
      Promise.resolve(ctx),
    );

    await parallel(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    const passedContext = next.mock.calls[0][0];
    expect(passedContext.response.assetsBalance).toBeDefined();
    expect(passedContext.response.assetsBalance?.[MOCK_ACCOUNT_ID]).toEqual({
      [MOCK_ASSET]: { amount: '100' },
      'eip155:137/slip44:60': { amount: '200' },
    });
    expect(middlewareA).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ chainIds: [MOCK_CHAIN] }),
      }),
      expect.any(Function),
    );
    expect(middlewareB).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ chainIds: [CHAIN_2] }),
      }),
      expect.any(Function),
    );
  });

  it('uses fallback when one middleware throws: merges results from others', async () => {
    const CHAIN_2 = 'eip155:137' as ChainId;
    const goodMiddleware = jest.fn(async (ctx: Context, next) => {
      ctx.response.assetsBalance = {
        [MOCK_ACCOUNT_ID]: {
          [MOCK_ASSET]: { amount: '42' },
        },
      };
      return next(ctx);
    });
    const failingMiddleware = jest.fn(async () => {
      throw new Error('Source unavailable');
    });

    const parallel = createParallelBalanceMiddleware([
      { middleware: goodMiddleware, getActiveChains: () => [MOCK_CHAIN] },
      { middleware: failingMiddleware, getActiveChains: () => [CHAIN_2] },
    ]);
    const context = createContext({
      request: createDataRequest({ chainIds: [MOCK_CHAIN, CHAIN_2] }),
    });
    const next = jest.fn().mockImplementation((ctx: Context) =>
      Promise.resolve(ctx),
    );

    await parallel(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    const passedContext = next.mock.calls[0][0];
    expect(passedContext.response.assetsBalance).toEqual({
      [MOCK_ACCOUNT_ID]: {
        [MOCK_ASSET]: { amount: '42' },
      },
    });
  });

  it('passes through to next with initial response when all middlewares fail', async () => {
    const failing1 = jest.fn(async () => {
      throw new Error('Fail 1');
    });
    const failing2 = jest.fn(async () => {
      throw new Error('Fail 2');
    });

    const parallel = createParallelBalanceMiddleware([
      { middleware: failing1, getActiveChains: () => [MOCK_CHAIN] },
      { middleware: failing2, getActiveChains: () => ['eip155:137' as ChainId] },
    ]);
    const context = createContext({
      request: createDataRequest({ chainIds: [MOCK_CHAIN, 'eip155:137' as ChainId] }),
    });
    const next = jest.fn().mockImplementation((ctx: Context) =>
      Promise.resolve(ctx),
    );

    await parallel(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].response).toEqual({});
  });

  it('runs middlewares in parallel', async () => {
    const CHAIN_2 = 'eip155:137' as ChainId;
    const order: number[] = [];
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const slowMiddleware = jest.fn(async (ctx: Context, next) => {
      order.push(1);
      await delay(20);
      order.push(2);
      ctx.response.assetsBalance = { [MOCK_ACCOUNT_ID]: {} };
      return next(ctx);
    });
    const fastMiddleware = jest.fn(async (ctx: Context, next) => {
      order.push(3);
      ctx.response.assetsBalance = { [MOCK_ACCOUNT_ID]: {} };
      return next(ctx);
    });

    const parallel = createParallelBalanceMiddleware([
      { middleware: slowMiddleware, getActiveChains: () => [MOCK_CHAIN] },
      { middleware: fastMiddleware, getActiveChains: () => [CHAIN_2] },
    ]);
    const context = createContext({
      request: createDataRequest({ chainIds: [MOCK_CHAIN, CHAIN_2] }),
    });
    const next = jest.fn().mockImplementation((ctx: Context) =>
      Promise.resolve(ctx),
    );

    await parallel(context, next);

    expect(order).toEqual([1, 3, 2]);
  });

  it('merges errors from multiple responses', async () => {
    const CHAIN_2 = 'eip155:2' as ChainId;
    const CHAIN_3 = 'eip155:3' as ChainId;
    const middlewareWithError = jest.fn(async (ctx: Context, next) => {
      ctx.response.assetsBalance = {};
      ctx.response.errors = { [CHAIN_2]: 'RPC failed' };
      return next(ctx);
    });
    const otherMiddleware = jest.fn(async (ctx: Context, next) => {
      ctx.response.errors = { [CHAIN_3]: 'Timeout' };
      return next(ctx);
    });

    const parallel = createParallelBalanceMiddleware([
      { middleware: middlewareWithError, getActiveChains: () => [CHAIN_2] },
      { middleware: otherMiddleware, getActiveChains: () => [CHAIN_3] },
    ]);
    const context = createContext({
      request: createDataRequest({ chainIds: [CHAIN_2, CHAIN_3] }),
    });
    const next = jest.fn().mockImplementation((ctx: Context) =>
      Promise.resolve(ctx),
    );

    await parallel(context, next);

    expect(next.mock.calls[0][0].response.errors).toEqual({
      'eip155:2': 'RPC failed',
      'eip155:3': 'Timeout',
    });
  });

  describe('fallback for remaining chains (no balance from primary)', () => {
    const CHAIN_2 = 'eip155:137' as ChainId;
    const ASSET_CHAIN_2 = 'eip155:137/slip44:60' as Caip19AssetId;

    it('runs fallback for remaining chains when primary returns no balance', async () => {
      const primary = jest.fn(async (ctx: Context, next) => {
        ctx.response.errors = { [MOCK_CHAIN]: 'Accounts API down' };
        return next(ctx);
      });
      const fallback = jest.fn(async (ctx: Context, next) => {
        expect(ctx.request.chainIds).toEqual([MOCK_CHAIN]);
        ctx.response.assetsBalance = {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET]: { amount: '99' },
          },
        };
        return next(ctx);
      });

      const parallel = createParallelBalanceMiddleware(
        [{ middleware: primary, getActiveChains: () => [MOCK_CHAIN] }],
        { fallbackMiddlewares: [fallback] },
      );
      const context = createContext();
      const next = jest.fn().mockImplementation((ctx: Context) =>
        Promise.resolve(ctx),
      );

      await parallel(context, next);

      expect(fallback).toHaveBeenCalledTimes(1);
      const passed = next.mock.calls[0][0].response;
      expect(passed.assetsBalance?.[MOCK_ACCOUNT_ID]?.[MOCK_ASSET]).toEqual({
        amount: '99',
      });
      expect(passed.errors).toBeUndefined();
    });

    it('runs fallback only for chains with no balance (others are not remaining)', async () => {
      const primary = jest.fn(async (ctx: Context, next) => {
        ctx.response.assetsBalance = {
          [MOCK_ACCOUNT_ID]: {
            [ASSET_CHAIN_2]: { amount: '200' },
          },
        };
        return next(ctx);
      });
      const fallback = jest.fn(async (ctx: Context, next) => {
        expect(ctx.request.chainIds).toEqual([MOCK_CHAIN]);
        ctx.response.assetsBalance = {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET]: { amount: '1' },
          },
        };
        return next(ctx);
      });

      const parallel = createParallelBalanceMiddleware(
        [{ middleware: primary, getActiveChains: () => [CHAIN_2] }],
        { fallbackMiddlewares: [fallback] },
      );
      const context = createContext({
        request: createDataRequest({ chainIds: [MOCK_CHAIN, CHAIN_2] }),
      });
      const next = jest.fn().mockImplementation((ctx: Context) =>
        Promise.resolve(ctx),
      );

      await parallel(context, next);

      expect(fallback).toHaveBeenCalledTimes(1);
      const passed = next.mock.calls[0][0].response;
      expect(passed.assetsBalance?.[MOCK_ACCOUNT_ID]).toEqual({
        [MOCK_ASSET]: { amount: '1' },
        [ASSET_CHAIN_2]: { amount: '200' },
      });
    });

    it('does not run fallback when all chains have balance after primary run', async () => {
      const primary = jest.fn(async (ctx: Context, next) => {
        ctx.response.assetsBalance = {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET]: { amount: '10' } },
        };
        return next(ctx);
      });
      const fallback = jest.fn(async (ctx: Context, next) => next(ctx));

      const parallel = createParallelBalanceMiddleware(
        [{ middleware: primary, getActiveChains: () => [MOCK_CHAIN] }],
        { fallbackMiddlewares: [fallback] },
      );
      const context = createContext();
      const next = jest.fn().mockImplementation((ctx: Context) =>
        Promise.resolve(ctx),
      );

      await parallel(context, next);

      expect(fallback).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].response.assetsBalance?.[MOCK_ACCOUNT_ID]).toEqual({
        [MOCK_ASSET]: { amount: '10' },
      });
    });

    it('keeps errors for remaining chains that fallback did not supply balance for', async () => {
      const primary = jest.fn(async (ctx: Context, next) => {
        ctx.response.errors = {
          [MOCK_CHAIN]: 'Failed',
          [CHAIN_2]: 'Failed',
        };
        return next(ctx);
      });
      const fallback = jest.fn(async (ctx: Context, next) => {
        ctx.response.assetsBalance = {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET]: { amount: '1' } },
        };
        return next(ctx);
      });

      const parallel = createParallelBalanceMiddleware(
        [
          {
            middleware: primary,
            getActiveChains: () => [MOCK_CHAIN, CHAIN_2],
          },
        ],
        { fallbackMiddlewares: [fallback] },
      );
      const context = createContext({
        request: createDataRequest({ chainIds: [MOCK_CHAIN, CHAIN_2] }),
      });
      const next = jest.fn().mockImplementation((ctx: Context) =>
        Promise.resolve(ctx),
      );

      await parallel(context, next);

      const passed = next.mock.calls[0][0].response;
      expect(passed.assetsBalance?.[MOCK_ACCOUNT_ID]?.[MOCK_ASSET]).toEqual({
        amount: '1',
      });
      expect(passed.errors).toEqual({ [CHAIN_2]: 'Failed' });
    });
  });
});
