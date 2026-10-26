import type { InternalAccount } from '@metamask/keyring-internal-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockedFunction } from 'vitest';

import type {
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataRequest,
  DataResponse,
  Middleware,
  NextFunction,
} from '../types.js';
import { RpcFallbackMiddleware } from './RpcFallbackMiddleware.js';

const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ASSET_MAINNET = 'eip155:1/slip44:60' as Caip19AssetId;
const MOCK_ASSET_POLYGON = 'eip155:137/slip44:966' as Caip19AssetId;
const MOCK_ASSET_BSC = 'eip155:56/slip44:714' as Caip19AssetId;
const MOCK_ERC20_POLYGON =
  'eip155:137/erc20:0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Caip19AssetId;

function createMockAccount(id: string = MOCK_ACCOUNT_ID): InternalAccount {
  return {
    id,
    address: '0x1234567890123456789012345678901234567890',
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: 0,
      lastSelected: 0,
    },
  };
}

function createDataRequest(
  chainIds: ChainId[] = ['eip155:1'],
  supportedChains: ChainId[] = chainIds,
): DataRequest {
  return {
    chainIds,
    accountsWithSupportedChains: [
      { account: createMockAccount(), supportedChains },
    ],
    dataTypes: ['balance'],
  };
}

function createContext(
  request: DataRequest,
  response: DataResponse = {},
): Context {
  return {
    request,
    response,
  };
}

function createNext(): MockedFunction<NextFunction> {
  return vi.fn(async (innerCtx) => innerCtx);
}

function createFallback(source: AssetsDataSource): RpcFallbackMiddleware {
  return new RpcFallbackMiddleware({
    rpcDataSource: source,
  });
}

function createMockRpcSource(response: DataResponse = {}): {
  source: AssetsDataSource;
  middleware: MockedFunction<Middleware>;
} {
  const middleware: MockedFunction<Middleware> = vi.fn(async (ctx, next) => {
    ctx.response = response;
    return next(ctx);
  });
  const source: AssetsDataSource = {
    getName: () => 'RpcDataSource',
    get assetsMiddleware() {
      return middleware;
    },
  };
  return { source, middleware };
}

describe('RpcFallbackMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes through when there are no errors in the response', async () => {
    const { source, middleware: rpcMw } = createMockRpcSource();
    const mw = createFallback(source);
    const ctx = createContext(createDataRequest(['eip155:1']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
      },
    });
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    expect(rpcMw).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(ctx);
  });

  it('calls RPC only for chains present in response.errors', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_POLYGON]: { amount: '5' } },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = createFallback(source);
    const ctx = createContext(createDataRequest(['eip155:1', 'eip155:137']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
      },
      errors: { 'eip155:137': 'Unprocessed by Accounts API' },
    });
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    expect(rpcMw).toHaveBeenCalledTimes(1);
    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
  });

  it('merges RPC balances into the existing response', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_POLYGON]: { amount: '5' } },
      },
    };
    const { source } = createMockRpcSource(rpcResponse);
    const mw = createFallback(source);
    const ctx = createContext(createDataRequest(['eip155:1', 'eip155:137']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
      },
      errors: { 'eip155:137': 'Unprocessed by Accounts API' },
    });
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.assetsBalance[MOCK_ACCOUNT_ID]).toStrictEqual({
      [MOCK_ASSET_MAINNET]: { amount: '1' },
      [MOCK_ASSET_POLYGON]: { amount: '5' },
    });
  });

  it('clears errors for chains RPC successfully recovered', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_POLYGON]: { amount: '5' } },
      },
    };
    const { source } = createMockRpcSource(rpcResponse);
    const mw = createFallback(source);
    const ctx = createContext(createDataRequest(['eip155:137']), {
      errors: { 'eip155:137': 'Fetch failed: oops' },
    });
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors?.['eip155:137']).toBeUndefined();
  });

  it('keeps errors for chains RPC could not recover', async () => {
    const { source } = createMockRpcSource({});
    const mw = createFallback(source);
    const ctx = createContext(createDataRequest(['eip155:137']), {
      errors: { 'eip155:137': 'Fetch failed: oops' },
    });
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors?.['eip155:137']).toBe('Fetch failed: oops');
  });

  it('does not clear an error for a chain RPC failed on, even when upstream returned partial balance for it', async () => {
    // Regression: previously the error-clearing logic looked at the merged
    // response, so a chain that already had partial balance data from
    // upstream (e.g. AccountsApi returned an asset for chain X but also
    // reported chain X in unprocessedNetworks) and then failed under RPC
    // would still have its error cleared. The check must look at what RPC
    // actually returned.
    const { source } = createMockRpcSource({}); // RPC fails — empty response
    const mw = createFallback(source);
    const ctx = createContext(createDataRequest(['eip155:137']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_POLYGON]: { amount: '7' } },
      },
      errors: { 'eip155:137': 'Unprocessed by Accounts API' },
    });
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors?.['eip155:137']).toBe(
      'Unprocessed by Accounts API',
    );
  });

  it('does not run for non-balance data types', async () => {
    const { source, middleware: rpcMw } = createMockRpcSource();
    const mw = createFallback(source);
    const ctx = createContext(
      {
        ...createDataRequest(['eip155:1']),
        dataTypes: ['metadata'],
      },
      { errors: { 'eip155:1': 'something' } },
    );
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    expect(rpcMw).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(ctx);
  });

  it('handles multiple errored chains at once', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [MOCK_ASSET_POLYGON]: { amount: '5' },
          [MOCK_ASSET_BSC]: { amount: '9' },
        },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = createFallback(source);
    const ctx = createContext(
      createDataRequest(['eip155:1', 'eip155:137', 'eip155:56']),
      {
        errors: {
          'eip155:137': 'Unprocessed',
          'eip155:56': 'Fetch failed',
        },
      },
    );
    const next = createNext();

    await mw.assetsMiddleware(ctx, next);

    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(new Set(rpcCtx.request.chainIds)).toStrictEqual(
      new Set(['eip155:137', 'eip155:56']),
    );
    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors).toStrictEqual({});
  });

  describe('Accounts API v6', () => {
    const createV6Middleware = (
      rpcDataSource: AssetsDataSource,
    ): RpcFallbackMiddleware =>
      new RpcFallbackMiddleware({
        rpcDataSource,
      });

    it('retries an errored chain without listing tracked assets on the request', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource({
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_POLYGON]: { amount: '10' },
            [MOCK_ERC20_POLYGON]: { amount: '50' },
          },
        },
      });
      const mw = createV6Middleware(source);
      const ctx = createContext(createDataRequest(['eip155:1', 'eip155:137']), {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1.2' } },
        },
        errors: { 'eip155:137': 'Unprocessed by Accounts API' },
      });
      const next = createNext();

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).toHaveBeenCalledTimes(1);
      const [rpcCtx] = rpcMw.mock.calls[0];
      expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
      // v6 lets RPC read the whole chain from state instead of scoping the
      // request to the assets the Accounts API left empty.
      expect(rpcCtx.request.customAssets).toBeUndefined();
    });

    it('leaves a hidden asset out of the errored-chain retry', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource({});
      const mw = createV6Middleware(source);
      const ctx = createContext(createDataRequest(['eip155:137']), {
        errors: { 'eip155:137': 'Fetch failed' },
      });
      const next = createNext();

      await mw.assetsMiddleware(ctx, next);

      const [rpcCtx] = rpcMw.mock.calls[0];
      expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
      expect(rpcCtx.request.customAssets).toBeUndefined();
    });

    it('merges the recovered chain into the response and clears its error', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource({
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_POLYGON]: { amount: '3' } },
        },
      });
      const mw = createV6Middleware(source);
      const ctx = createContext(createDataRequest(['eip155:1', 'eip155:137']), {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
        },
        errors: { 'eip155:137': 'Unresolved includeAssetIds' },
      });
      const next = createNext();

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).toHaveBeenCalledTimes(1);
      const finalCtx = next.mock.calls[0][0];
      expect(finalCtx.response.assetsBalance[MOCK_ACCOUNT_ID]).toStrictEqual({
        [MOCK_ASSET_MAINNET]: { amount: '1' },
        [MOCK_ERC20_POLYGON]: { amount: '3' },
      });
      expect(finalCtx.response.errors).toStrictEqual({});
    });

    it('keeps the chain error when the RPC retry recovers nothing', async () => {
      const { source } = createMockRpcSource({});
      const mw = createV6Middleware(source);
      const ctx = createContext(createDataRequest(['eip155:137']), {
        errors: { 'eip155:137': 'Unresolved includeAssetIds' },
      });
      const next = createNext();

      await mw.assetsMiddleware(ctx, next);

      const finalCtx = next.mock.calls[0][0];
      expect(finalCtx.response.errors).toStrictEqual({
        'eip155:137': 'Unresolved includeAssetIds',
      });
    });

    it('drops partial balances for chains the RPC retry itself reported as errored', async () => {
      // RPC recovered Polygon but errored on BSC. The BSC balances it did emit
      // are incomplete, so they must not replace the upstream response, and the
      // upstream BSC error must survive with the RPC failure reason.
      const { source } = createMockRpcSource({
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_POLYGON]: { amount: '5' },
            [MOCK_ASSET_BSC]: { amount: '0' },
          },
        },
        errors: { 'eip155:56': 'Fetch failed: rpc down' },
      });
      const mw = createV6Middleware(source);
      const ctx = createContext(
        createDataRequest(['eip155:137', 'eip155:56']),
        {
          errors: {
            'eip155:137': 'Fetch failed: oops',
            'eip155:56': 'Fetch failed: oops',
          },
        },
      );
      const next = createNext();

      await mw.assetsMiddleware(ctx, next);

      const finalCtx = next.mock.calls[0][0];
      expect(finalCtx.response.assetsBalance[MOCK_ACCOUNT_ID]).toStrictEqual({
        [MOCK_ASSET_POLYGON]: { amount: '5' },
      });
      expect(finalCtx.response.errors).toStrictEqual({
        'eip155:56': 'Fetch failed: rpc down',
      });
    });

    it('does not run for non-balance data types', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = createV6Middleware(source);
      const ctx = createContext(
        {
          ...createDataRequest(['eip155:1']),
          dataTypes: ['metadata'],
        },
        { errors: { 'eip155:1': 'something' } },
      );
      const next = createNext();

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(ctx);
    });
  });
});
