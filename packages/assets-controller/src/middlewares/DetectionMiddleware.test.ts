import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger } from '@metamask/messenger';

import { DetectionMiddleware } from './DetectionMiddleware';
import type {
  Context,
  DataRequest,
  Caip19AssetId,
  AssetsControllerStateInternal,
} from '../types';

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ASSET_1 =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const MOCK_ASSET_2 =
  'eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7' as Caip19AssetId;
const MOCK_NATIVE_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;

function createMockAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: MOCK_ACCOUNT_ID,
    address: MOCK_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

function createDataRequest(
  overrides?: Partial<DataRequest> & { accounts?: InternalAccount[] },
): DataRequest {
  const chainIds = overrides?.chainIds ?? ['eip155:1'];
  const accounts = overrides?.accounts ?? [createMockAccount()];
  const { accounts: _a, ...rest } = overrides ?? {};
  return {
    chainIds,
    accountsWithSupportedChains: accounts.map((a) => ({
      account: a,
      supportedChains: chainIds,
    })),
    dataTypes: ['balance'],
    ...rest,
  } as DataRequest;
}

function createAssetsState(
  metadataAssets: Caip19AssetId[] = [],
): AssetsControllerStateInternal {
  const assetsInfo: Record<Caip19AssetId, { name: string }> = {};
  for (const assetId of metadataAssets) {
    assetsInfo[assetId] = { name: `Asset ${assetId}` };
  }
  return {
    assetsInfo,
    assetsBalance: {},
    customAssets: {},
  } as AssetsControllerStateInternal;
}

function createMiddlewareContext(
  overrides?: Partial<Context>,
  stateMetadata: Caip19AssetId[] = [],
): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest.fn().mockReturnValue(createAssetsState(stateMetadata)),
    ...overrides,
  };
}

function setupController(): {
  middleware: DetectionMiddleware;
  messenger: Messenger<'DetectionMiddleware', never, never>;
} {
  const messenger = new Messenger<'DetectionMiddleware', never, never>({
    namespace: 'DetectionMiddleware',
  });

  const middlewareInstance = new DetectionMiddleware();

  return {
    middleware: middlewareInstance,
    messenger,
  };
}

describe('DetectionMiddleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct name', () => {
    const { middleware } = setupController();
    expect(middleware.name).toBe('DetectionMiddleware');
  });

  it('exposes getAssetsMiddleware on instance', () => {
    const { middleware } = setupController();

    const middlewareFn = middleware.assetsMiddleware;
    expect(typeof middlewareFn).toBe('function');
  });

  it('passes through when no balances in response', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext({
      response: {},
    });
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
    expect(context.response.detectedAssets).toBeUndefined();
  });

  it('detects assets without metadata', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext(
      {
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
              [MOCK_ASSET_2]: { amount: '2000' },
            },
          },
        },
      },
      [],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1, MOCK_ASSET_2],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('includes all balance assets in detectedAssets even when they have metadata', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext(
      {
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
              [MOCK_NATIVE_ASSET]: { amount: '2000' },
            },
          },
        },
      },
      [MOCK_ASSET_1, MOCK_NATIVE_ASSET],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    // All assets in balance are included so prices (and metadata when needed) are fetched
    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1, MOCK_NATIVE_ASSET],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('includes all balance assets in mixed scenario (metadata presence is ignored)', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext(
      {
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
              [MOCK_ASSET_2]: { amount: '2000' },
              [MOCK_NATIVE_ASSET]: { amount: '3000' },
            },
          },
        },
      },
      [MOCK_ASSET_1],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1, MOCK_ASSET_2, MOCK_NATIVE_ASSET],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('handles multiple accounts', async () => {
    const { middleware } = setupController();
    const account2Id = 'account-2-id';
    const context = createMiddlewareContext(
      {
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
            },
            [account2Id]: {
              [MOCK_ASSET_2]: { amount: '2000' },
              [MOCK_NATIVE_ASSET]: { amount: '3000' },
            },
          },
        },
      },
      [MOCK_NATIVE_ASSET],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1],
      [account2Id]: [MOCK_ASSET_2, MOCK_NATIVE_ASSET],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('includes all balance assets per account regardless of metadata', async () => {
    const { middleware } = setupController();
    const account2Id = 'account-2-id';
    const context = createMiddlewareContext(
      {
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
            },
            [account2Id]: {
              [MOCK_ASSET_2]: { amount: '2000' },
            },
          },
        },
      },
      [MOCK_ASSET_1],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    // Both accounts get their balance assets so prices/metadata can be fetched
    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1],
      [account2Id]: [MOCK_ASSET_2],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('only runs for balance dataType', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext({
      request: createDataRequest({ dataTypes: ['metadata'] }),
      response: {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_1]: { amount: '1000' },
          },
        },
      },
    });
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toBeUndefined();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('runs when dataTypes includes balance among others', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext(
      {
        request: createDataRequest({ dataTypes: ['balance', 'metadata'] }),
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
            },
          },
        },
      },
      [],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('handles empty assetsBalance object', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext({
      response: {
        assetsBalance: {},
      },
    });
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toBeUndefined();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('handles account with empty balances', async () => {
    const { middleware } = setupController();
    const context = createMiddlewareContext({
      response: {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {},
        },
      },
    });
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toBeUndefined();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('retrieves middleware from instance', async () => {
    const { middleware } = setupController();
    const middlewareFn = middleware.assetsMiddleware;

    const context = createMiddlewareContext(
      {
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
            },
          },
        },
      },
      [],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middlewareFn(context, next);

    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1],
    });
  });
});
