import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataRequest,
  DataResponse,
} from '../types';
import { RpcFallbackMiddleware } from './RpcFallbackMiddleware';

const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ASSET_MAINNET = 'eip155:1/slip44:60' as Caip19AssetId;
const MOCK_ASSET_POLYGON = 'eip155:137/slip44:966' as Caip19AssetId;
const MOCK_ASSET_BSC = 'eip155:56/slip44:714' as Caip19AssetId;
const MOCK_TOKEN_POLYGON =
  'eip155:137/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const MOCK_TOKEN_MAINNET =
  'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7' as Caip19AssetId;

function createMockAccount(): InternalAccount {
  return {
    id: MOCK_ACCOUNT_ID,
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
  } as InternalAccount;
}

function createDataRequest(chainIds: ChainId[] = ['eip155:1']): DataRequest {
  return {
    chainIds,
    accountsWithSupportedChains: [
      { account: createMockAccount(), supportedChains: chainIds },
    ],
    dataTypes: ['balance'],
  } as DataRequest;
}

function createContext(
  request: DataRequest,
  response: DataResponse = {},
): Context {
  return {
    request,
    response,
    getAssetsState: jest.fn(),
  };
}

function createMockRpcSource(response: DataResponse = {}): {
  source: AssetsDataSource;
  middleware: jest.Mock;
} {
  const middleware = jest.fn(async (ctx, next) => {
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
    jest.clearAllMocks();
  });

  it('passes through when there are no errors in the response', async () => {
    const { source, middleware: rpcMw } = createMockRpcSource();
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:1']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
      },
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

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
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:1', 'eip155:137']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
      },
      errors: { 'eip155:137': 'Unprocessed by Accounts API' },
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

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
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:1', 'eip155:137']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
      },
      errors: { 'eip155:137': 'Unprocessed by Accounts API' },
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

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
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:137']), {
      errors: { 'eip155:137': 'Fetch failed: oops' },
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors?.['eip155:137']).toBeUndefined();
  });

  it('keeps errors for chains RPC could not recover', async () => {
    const { source } = createMockRpcSource({});
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:137']), {
      errors: { 'eip155:137': 'Fetch failed: oops' },
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

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
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:137']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_POLYGON]: { amount: '7' } },
      },
      errors: { 'eip155:137': 'Unprocessed by Accounts API' },
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors?.['eip155:137']).toBe(
      'Unprocessed by Accounts API',
    );
  });

  it('does not run for non-balance data types', async () => {
    const { source, middleware: rpcMw } = createMockRpcSource();
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(
      {
        ...createDataRequest(['eip155:1']),
        dataTypes: ['metadata'],
      } as DataRequest,
      { errors: { 'eip155:1': 'something' } },
    );
    const next = jest.fn(async (innerCtx) => innerCtx);

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
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(
      createDataRequest(['eip155:1', 'eip155:137', 'eip155:56']),
      {
        errors: {
          'eip155:137': 'Unprocessed',
          'eip155:56': 'Fetch failed',
        },
      },
    );
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(new Set(rpcCtx.request.chainIds)).toStrictEqual(
      new Set(['eip155:137', 'eip155:56']),
    );
    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors).toStrictEqual({});
  });

  it('recovers unprocessedCustomAssets with an RPC call scoped to just those assets (via customAssets), not a whole-chain fetch', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_TOKEN_POLYGON]: { amount: '3' } },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:1', 'eip155:137']), {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
      },
      unprocessedCustomAssets: [MOCK_TOKEN_POLYGON],
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    expect(rpcMw).toHaveBeenCalledTimes(1);
    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
    expect(rpcCtx.request.customAssets).toStrictEqual([MOCK_TOKEN_POLYGON]);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.assetsBalance[MOCK_ACCOUNT_ID]).toStrictEqual({
      [MOCK_ASSET_MAINNET]: { amount: '1' },
      [MOCK_TOKEN_POLYGON]: { amount: '3' },
    });
    // Recovered — removed from the asset axis.
    expect(finalCtx.response.unprocessedCustomAssets).toBeUndefined();
  });

  it('skips asset-scoped recovery for assets whose chain was already retried on the chain axis', async () => {
    // The chain-axis fetch (native + custom assets) already covers the token, so
    // there must be no second, asset-scoped RPC call for the same chain.
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_TOKEN_POLYGON]: { amount: '3' } },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:137']), {
      errors: { 'eip155:137': 'Unprocessed networks' },
      unprocessedCustomAssets: [MOCK_TOKEN_POLYGON],
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    // Only the chain-axis call — it uses the original request (no customAssets
    // override to the unresolved subset).
    expect(rpcMw).toHaveBeenCalledTimes(1);
    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
    expect(rpcCtx.request.customAssets).toBeUndefined();

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors).toStrictEqual({});
    expect(finalCtx.response.unprocessedCustomAssets).toBeUndefined();
  });

  it('keeps unprocessedCustomAssets that RPC could not recover', async () => {
    const { source } = createMockRpcSource({}); // RPC returns nothing
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(createDataRequest(['eip155:137']), {
      unprocessedCustomAssets: [MOCK_TOKEN_POLYGON],
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.unprocessedCustomAssets).toStrictEqual([
      MOCK_TOKEN_POLYGON,
    ]);
  });

  it('recovers both errored chains and unprocessed assets in separate RPC calls', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [MOCK_ASSET_BSC]: { amount: '9' },
          [MOCK_TOKEN_MAINNET]: { amount: '4' },
        },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
    const ctx = createContext(
      createDataRequest(['eip155:1', 'eip155:56']),
      {
        errors: { 'eip155:56': 'Fetch failed' },
        unprocessedCustomAssets: [MOCK_TOKEN_MAINNET],
      },
    );
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    // One call for the errored chain (whole chain), one scoped call for the pin.
    expect(rpcMw).toHaveBeenCalledTimes(2);
    const chainCall = rpcMw.mock.calls[0][0];
    expect(chainCall.request.chainIds).toStrictEqual(['eip155:56']);
    expect(chainCall.request.customAssets).toBeUndefined();
    const assetCall = rpcMw.mock.calls[1][0];
    expect(assetCall.request.chainIds).toStrictEqual(['eip155:1']);
    expect(assetCall.request.customAssets).toStrictEqual([MOCK_TOKEN_MAINNET]);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors).toStrictEqual({});
    expect(finalCtx.response.unprocessedCustomAssets).toBeUndefined();
  });
});
