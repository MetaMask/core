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
const MOCK_ERC20_MAINNET =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const MOCK_ERC20_POLYGON =
  'eip155:137/erc20:0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Caip19AssetId;
const MOCK_STAKING_ASSET_MAINNET =
  'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df' as Caip19AssetId;
const MOCK_NON_EVM_ASSET =
  'bip122:000000000019d6689c085ae165831e93/slip44:0' as Caip19AssetId;

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

  describe('assets tracked in state that the response left empty', () => {
    it('passes through when tracked assets all have a positive balance in the response', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '12' } },
          },
        },
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(ctx);
    });

    it('matches response asset IDs case-insensitively', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ERC20_MAINNET.toLowerCase()]: { amount: '12' },
            },
          },
        },
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).not.toHaveBeenCalled();
    });

    it('fetches tracked assets the response omitted via RPC', async () => {
      const rpcResponse: DataResponse = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '42' } },
        },
      };
      const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '1' } },
          },
        },
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_MAINNET]: { amount: '1' },
              [MOCK_ERC20_MAINNET]: { amount: '1000' },
            },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).toHaveBeenCalledTimes(1);
      const [rpcCtx] = rpcMw.mock.calls[0];
      expect(rpcCtx.request.chainIds).toStrictEqual(['eip155:1']);
      expect(rpcCtx.request.customAssets).toStrictEqual([MOCK_ERC20_MAINNET]);
      expect(
        next.mock.calls[0][0].response.assetsBalance[MOCK_ACCOUNT_ID],
      ).toStrictEqual({
        [MOCK_ASSET_MAINNET]: { amount: '1' },
        [MOCK_ERC20_MAINNET]: { amount: '42' },
      });
    });

    it('fetches tracked assets the response reports as zero via RPC', async () => {
      const rpcResponse: DataResponse = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '9' } },
        },
      };
      const { source, middleware: rpcMw } = createMockRpcSource(rpcResponse);
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '0' } },
          },
        },
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).toHaveBeenCalledTimes(1);
      expect(
        next.mock.calls[0][0].response.assetsBalance[MOCK_ACCOUNT_ID][
          MOCK_ERC20_MAINNET
        ],
      ).toStrictEqual({ amount: '9' });
    });

    it('fetches custom assets from state that the response left empty', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {},
        { customAssets: { [MOCK_ACCOUNT_ID]: [MOCK_ERC20_MAINNET] } },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw.mock.calls[0][0].request.customAssets).toStrictEqual([
        MOCK_ERC20_MAINNET,
      ]);
    });

    it('keeps custom assets already on the request', async () => {
      const otherCustom =
        'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7' as Caip19AssetId;
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        { ...createDataRequest(['eip155:1']), customAssets: [otherCustom] },
        {},
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw.mock.calls[0][0].request.customAssets).toStrictEqual([
        otherCustom,
        MOCK_ERC20_MAINNET,
      ]);
    });

    it('skips staking contract assets', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {},
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_STAKING_ASSET_MAINNET]: { amount: '1000' },
            },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).not.toHaveBeenCalled();
    });

    it('skips non-EVM tracked assets', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {},
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_NON_EVM_ASSET]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).not.toHaveBeenCalled();
    });

    it('skips tracked assets on chains outside the request', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1'], ['eip155:1', 'eip155:137']),
        {},
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_POLYGON]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).not.toHaveBeenCalled();
    });

    it('skips tracked assets on chains the account does not support', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1', 'eip155:137'], ['eip155:1']),
        {},
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_POLYGON]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw).not.toHaveBeenCalled();
    });

    it('fetches both errored chains and chains of stale tracked assets', async () => {
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1', 'eip155:137']),
        {
          errors: { 'eip155:137': 'Unprocessed by Accounts API' },
        },
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(new Set(rpcMw.mock.calls[0][0].request.chainIds)).toStrictEqual(
        new Set(['eip155:137', 'eip155:1']),
      );
    });

    it('discards failed RPC results for stale-asset chains so upstream balances survive', async () => {
      // Regression: RpcDataSource writes a native `0` stub for chains it fails
      // on. For a chain fetched only because of a stale tracked asset (the
      // upstream source succeeded on it), merging that stub would overwrite
      // the correct native amount and, with replaceCoveredChainBalances, wipe
      // the chain's token slice from state.
      const rpcFailureResponse: DataResponse = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '0' } },
        },
        errors: { 'eip155:1': 'Fetch failed: provider down' },
      };
      const { source } = createMockRpcSource(rpcFailureResponse);
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1']),
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '5' } },
          },
        },
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_MAINNET]: { amount: '5' },
              [MOCK_ERC20_MAINNET]: { amount: '1000' },
            },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      const finalCtx = next.mock.calls[0][0];
      expect(finalCtx.response.assetsBalance[MOCK_ACCOUNT_ID]).toStrictEqual({
        [MOCK_ASSET_MAINNET]: { amount: '5' },
      });
      expect(finalCtx.response.errors?.['eip155:1']).toBeUndefined();
    });

    it('drops failure stubs but keeps the error for chains already errored upstream', async () => {
      // The stub must not count as a "recovered" balance either — the chain
      // stays errored so the slow pipeline retries it.
      const rpcFailureResponse: DataResponse = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_POLYGON]: { amount: '0' } },
        },
        errors: { 'eip155:137': 'Fetch failed: provider down' },
      };
      const { source } = createMockRpcSource(rpcFailureResponse);
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(createDataRequest(['eip155:137']), {
        errors: { 'eip155:137': 'Unprocessed by Accounts API' },
      });
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      const finalCtx = next.mock.calls[0][0];
      expect(
        finalCtx.response.assetsBalance?.[MOCK_ACCOUNT_ID],
      ).toBeUndefined();
      expect(finalCtx.response.errors?.['eip155:137']).toBe(
        'Fetch failed: provider down',
      );
    });

    it('merges recovered errored chains while discarding a failed stale-asset chain', async () => {
      const rpcResponse: DataResponse = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_POLYGON]: { amount: '7' },
            [MOCK_ASSET_MAINNET]: { amount: '0' },
          },
        },
        errors: { 'eip155:1': 'Fetch failed: provider down' },
      };
      const { source } = createMockRpcSource(rpcResponse);
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const ctx = createContext(
        createDataRequest(['eip155:1', 'eip155:137']),
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_MAINNET]: { amount: '5' } },
          },
          errors: { 'eip155:137': 'Unprocessed by Accounts API' },
        },
        {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '1000' } },
          },
        },
      );
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      const finalCtx = next.mock.calls[0][0];
      expect(finalCtx.response.assetsBalance[MOCK_ACCOUNT_ID]).toStrictEqual({
        [MOCK_ASSET_MAINNET]: { amount: '5' },
        [MOCK_ASSET_POLYGON]: { amount: '7' },
      });
      expect(finalCtx.response.errors).toStrictEqual({});
    });

    it('deduplicates stale assets shared by several accounts', async () => {
      const secondAccountId = 'second-account-id';
      const stateBalances = {
        [MOCK_ACCOUNT_ID]: { [MOCK_ERC20_MAINNET]: { amount: '1000' } },
        [secondAccountId]: { [MOCK_ERC20_MAINNET]: { amount: '5' } },
      };
      const { source, middleware: rpcMw } = createMockRpcSource();
      const mw = new RpcFallbackMiddleware({ rpcDataSource: source });
      const request = {
        ...createDataRequest(['eip155:1']),
        accountsWithSupportedChains: [
          {
            account: createMockAccount(),
            supportedChains: ['eip155:1'] as ChainId[],
          },
          {
            account: createMockAccount(secondAccountId),
            supportedChains: ['eip155:1'] as ChainId[],
          },
        ],
      };
      const ctx = createContext(request, {}, { assetsBalance: stateBalances });
      const next = jest.fn(async (innerCtx) => innerCtx);

      await mw.assetsMiddleware(ctx, next);

      expect(rpcMw.mock.calls[0][0].request.customAssets).toStrictEqual([
        MOCK_ERC20_MAINNET,
      ]);
    });
  });
});
