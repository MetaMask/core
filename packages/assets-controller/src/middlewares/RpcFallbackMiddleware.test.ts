import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  AssetsControllerStateInternal,
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataRequest,
  DataResponse,
} from '../types.js';
import { RpcFallbackMiddleware } from './RpcFallbackMiddleware.js';

const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ASSET_MAINNET = 'eip155:1/slip44:60' as Caip19AssetId;
const MOCK_ASSET_POLYGON = 'eip155:137/slip44:966' as Caip19AssetId;
const MOCK_ASSET_BSC = 'eip155:56/slip44:714' as Caip19AssetId;
const MOCK_TOKEN_POLYGON =
  'eip155:137/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const MOCK_TOKEN_MAINNET =
  'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7' as Caip19AssetId;

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
  } as InternalAccount;
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
  } as DataRequest;
}

type StateOverrides = {
  assetsBalance?: Record<string, Record<string, { amount: string }>>;
  customAssets?: Record<string, Caip19AssetId[]>;
  assetPreferences?: Record<string, { hidden?: boolean }>;
};

function createContext(
  request: DataRequest,
  response: DataResponse = {},
  stateOverrides: StateOverrides = {},
): Context {
  return {
    request,
    response,
    getAssetsState: jest.fn().mockReturnValue({
      assetsInfo: {},
      assetsBalance: stateOverrides.assetsBalance ?? {},
      customAssets: stateOverrides.customAssets ?? {},
      assetPreferences: stateOverrides.assetPreferences ?? {},
      assetsPrice: {},
    } as AssetsControllerStateInternal),
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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

  it('merges API unprocessed pins with every tracked asset on the errored chain in one RPC call', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [MOCK_ASSET_POLYGON]: { amount: '10' },
          [MOCK_TOKEN_POLYGON]: { amount: '50' },
        },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
    const ctx = createContext(
      createDataRequest(['eip155:1', 'eip155:137']),
      {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1.2' } },
        },
        errors: { 'eip155:137': 'Unprocessed by Accounts API' },
        unprocessedCustomAssets: [MOCK_TOKEN_POLYGON],
      },
      {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_POLYGON]: { amount: '10' },
            [MOCK_TOKEN_POLYGON]: { amount: '50' },
          },
        },
        customAssets: { [MOCK_ACCOUNT_ID]: [MOCK_TOKEN_POLYGON] },
      },
    );
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    expect(rpcMw).toHaveBeenCalledTimes(1);
    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
    expect(new Set(rpcCtx.request.customAssets)).toStrictEqual(
      new Set([MOCK_ASSET_POLYGON, MOCK_TOKEN_POLYGON]),
    );
  });

  it('leaves a hidden asset out of the errored-chain retry', async () => {
    const { source, middleware: rpcMw } = createMockRpcSource({});
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
    const ctx = createContext(
      createDataRequest(['eip155:137']),
      { errors: { 'eip155:137': 'Fetch failed' } },
      {
        customAssets: { [MOCK_ACCOUNT_ID]: [MOCK_TOKEN_POLYGON] },
        assetPreferences: { [MOCK_TOKEN_POLYGON]: { hidden: true } },
      },
    );
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
    expect(rpcCtx.request.customAssets).toBeUndefined();
  });

  it('recovers unprocessedCustomAssets with an RPC call scoped to just those assets (via customAssets), not a whole-chain fetch', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_TOKEN_POLYGON]: { amount: '3' } },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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

  it('puts an API unprocessed pin on the same RPC request as the errored chain, without a second call', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: { [MOCK_TOKEN_POLYGON]: { amount: '3' } },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
    const ctx = createContext(createDataRequest(['eip155:137']), {
      errors: { 'eip155:137': 'Unprocessed networks' },
      unprocessedCustomAssets: [MOCK_TOKEN_POLYGON],
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    expect(rpcMw).toHaveBeenCalledTimes(1);
    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:137']);
    expect(rpcCtx.request.customAssets).toStrictEqual([MOCK_TOKEN_POLYGON]);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors).toStrictEqual({});
    expect(finalCtx.response.unprocessedCustomAssets).toBeUndefined();
  });

  it('keeps unprocessedCustomAssets that RPC could not recover', async () => {
    const { source } = createMockRpcSource({}); // RPC returns nothing
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
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

  it('recovers an errored chain and an unprocessed pin on another chain in one RPC call', async () => {
    const rpcResponse: DataResponse = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [MOCK_ASSET_BSC]: { amount: '9' },
          [MOCK_TOKEN_MAINNET]: { amount: '4' },
        },
      },
    };
    const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
    const mw = new RpcFallbackMiddleware({
      rpcDataSource: source,
      isBalanceV6Enabled: (): boolean => true,
    });
    const ctx = createContext(createDataRequest(['eip155:1', 'eip155:56']), {
      errors: { 'eip155:56': 'Fetch failed' },
      unprocessedCustomAssets: [MOCK_TOKEN_MAINNET],
    });
    const next = jest.fn(async (innerCtx) => innerCtx);

    await mw.assetsMiddleware(ctx, next);

    expect(rpcMw).toHaveBeenCalledTimes(1);
    const [rpcCtx] = rpcMw.mock.calls[0];
    expect(new Set(rpcCtx.request.chainIds)).toStrictEqual(
      new Set(['eip155:56', 'eip155:1']),
    );
    expect(rpcCtx.request.customAssets).toStrictEqual([MOCK_TOKEN_MAINNET]);

    const finalCtx = next.mock.calls[0][0];
    expect(finalCtx.response.errors).toStrictEqual({});
    expect(finalCtx.response.unprocessedCustomAssets).toBeUndefined();
  });
});
