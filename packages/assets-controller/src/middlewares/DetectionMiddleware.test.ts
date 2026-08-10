import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger } from '@metamask/messenger';

import type {
  Context,
  DataRequest,
  Caip19AssetId,
  AssetsControllerStateInternal,
} from '../types.js';
import { normalizeAssetId } from '../utils/index.js';
import { DetectionMiddleware } from './DetectionMiddleware.js';

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ASSET_1 =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const MOCK_ASSET_2 =
  'eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7' as Caip19AssetId;
const MOCK_NATIVE_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;
const MOCK_SOL_NATIVE_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
const MOCK_SPL_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Caip19AssetId;
// Mainnet pooled-staking contract — exempt from detection gating.
const MOCK_STAKING_ASSET =
  'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df' as Caip19AssetId;

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
  assetsPrice: Caip19AssetId[] = [],
): AssetsControllerStateInternal {
  const assetsInfo: Record<Caip19AssetId, { name: string }> = {};
  for (const assetId of metadataAssets) {
    assetsInfo[assetId] = { name: `Asset ${assetId}` };
  }
  const priceState: Record<Caip19AssetId, { price: number }> = {};
  for (const assetId of assetsPrice) {
    priceState[assetId] = { price: 1 };
  }
  return {
    assetsInfo,
    assetsBalance: {},
    customAssets: {},
    assetsPrice: priceState,
  } as AssetsControllerStateInternal;
}

function createMiddlewareContext(
  overrides?: Partial<Context>,
  stateMetadata: Caip19AssetId[] = [],
  stateAssetsPrice: Caip19AssetId[] = [],
): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest
      .fn()
      .mockReturnValue(createAssetsState(stateMetadata, stateAssetsPrice)),
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
    expect(context.request.assetsForPriceUpdate).toStrictEqual([
      normalizeAssetId(MOCK_ASSET_1),
      normalizeAssetId(MOCK_ASSET_2),
    ]);
    expect(next).toHaveBeenCalledWith(context);
  });

  it('skips balance assets that already have metadata in state', async () => {
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

    // Both assets are already in state.assetsInfo → nothing new to detect
    expect(context.response.detectedAssets).toBeUndefined();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('only detects assets not already in state (mixed scenario)', async () => {
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

    // MOCK_ASSET_1 is already in state.assetsInfo → skipped; the other two are new
    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_2, MOCK_NATIVE_ASSET],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('handles multiple accounts, skipping assets already in state per account', async () => {
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

    // MOCK_NATIVE_ASSET is in state.assetsInfo → skipped for account2; MOCK_ASSET_1 and MOCK_ASSET_2 are new
    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1],
      [account2Id]: [MOCK_ASSET_2],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('skips an account entirely when all its balance assets are already in state', async () => {
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

    // MOCK_ASSET_1 is already in state.assetsInfo → MOCK_ACCOUNT_ID produces no new assets;
    // MOCK_ASSET_2 is new → account2 is included
    expect(context.response.detectedAssets).toStrictEqual({
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

  it('queues assetsForPriceUpdate for detected assets missing a price', async () => {
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
      [MOCK_ASSET_1],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1, MOCK_ASSET_2],
    });
    expect(context.request.assetsForPriceUpdate).toStrictEqual([
      normalizeAssetId(MOCK_ASSET_2),
    ]);
    expect(next).toHaveBeenCalledWith(context);
  });

  it('does not queue assetsForPriceUpdate when all detected assets have prices', async () => {
    const { middleware } = setupController();
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
      [MOCK_ASSET_1],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toStrictEqual({
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1],
    });
    expect(context.request.assetsForPriceUpdate).toBeUndefined();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('queues assetsForPriceUpdate for known balance assets that still lack a price', async () => {
    const { middleware } = setupController();
    // Asset already has metadata (known / seeded) but no price yet.
    const context = createMiddlewareContext(
      {
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_NATIVE_ASSET]: { amount: '0' },
            },
          },
        },
      },
      [MOCK_NATIVE_ASSET],
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(context.response.detectedAssets).toBeUndefined();
    expect(context.request.assetsForPriceUpdate).toStrictEqual([
      normalizeAssetId(MOCK_NATIVE_ASSET),
    ]);
    expect(next).toHaveBeenCalledWith(context);
  });

  describe('when token detection is disabled', () => {
    const setupDisabled = (): DetectionMiddleware =>
      new DetectionMiddleware({ isTokenDetectionEnabled: () => false });

    it('does not detect new tokens and strips them from the response (erc20 and SPL), keeping natives', async () => {
      const middleware = setupDisabled();
      const context = createMiddlewareContext({
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
              [MOCK_SPL_ASSET]: { amount: '5' },
              [MOCK_NATIVE_ASSET]: { amount: '2' },
              [MOCK_SOL_NATIVE_ASSET]: { amount: '3' },
            },
          },
          assetsInfo: {
            [MOCK_ASSET_1]: {
              type: 'erc20',
              name: 'Stub Token',
              symbol: 'STUB',
              decimals: 18,
            },
          },
        },
      });
      const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

      await middleware.assetsMiddleware(context, next);

      // Tokens are gone from balances and stub metadata; natives survive and
      // are still detected so their metadata/prices get fetched.
      expect(context.response.assetsBalance?.[MOCK_ACCOUNT_ID]).toStrictEqual({
        [MOCK_NATIVE_ASSET]: { amount: '2' },
        [MOCK_SOL_NATIVE_ASSET]: { amount: '3' },
      });
      expect(context.response.assetsInfo?.[MOCK_ASSET_1]).toBeUndefined();
      expect(context.response.detectedAssets).toStrictEqual({
        [MOCK_ACCOUNT_ID]: [MOCK_NATIVE_ASSET, MOCK_SOL_NATIVE_ASSET],
      });
      expect(next).toHaveBeenCalledWith(context);
    });

    it('keeps balance updates for tokens already tracked in state balances', async () => {
      const middleware = setupDisabled();
      const context = createMiddlewareContext({
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
            },
          },
        },
        getAssetsState: jest.fn().mockReturnValue({
          assetsInfo: {},
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_1]: { amount: '5' } },
          },
          customAssets: {},
          assetsPrice: {},
        }),
      });
      const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

      await middleware.assetsMiddleware(context, next);

      expect(
        context.response.assetsBalance?.[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_1],
      ).toStrictEqual({ amount: '1000' });
      expect(context.response.detectedAssets).toBeUndefined();
    });

    it('keeps balance updates for tokens known through state metadata', async () => {
      const middleware = setupDisabled();
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
        [MOCK_ASSET_1],
      );
      const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

      await middleware.assetsMiddleware(context, next);

      expect(
        context.response.assetsBalance?.[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_1],
      ).toStrictEqual({ amount: '1000' });
    });

    it('keeps and still detects custom assets (user-imported)', async () => {
      const middleware = setupDisabled();
      const context = createMiddlewareContext({
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
              [MOCK_ASSET_2]: { amount: '2000' },
            },
          },
        },
        getAssetsState: jest.fn().mockReturnValue({
          assetsInfo: {},
          assetsBalance: {},
          customAssets: { [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1] },
          assetsPrice: {},
        }),
      });
      const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

      await middleware.assetsMiddleware(context, next);

      // Custom asset survives and is detected; the other token is stripped.
      expect(context.response.assetsBalance?.[MOCK_ACCOUNT_ID]).toStrictEqual({
        [MOCK_ASSET_1]: { amount: '1000' },
      });
      expect(context.response.detectedAssets).toStrictEqual({
        [MOCK_ACCOUNT_ID]: [MOCK_ASSET_1],
      });
    });

    it('exempts custom assets stored in a different address case', async () => {
      const middleware = setupDisabled();
      const checksummedAsset =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const context = createMiddlewareContext({
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
            },
          },
        },
        getAssetsState: jest.fn().mockReturnValue({
          assetsInfo: {},
          assetsBalance: {},
          customAssets: { [MOCK_ACCOUNT_ID]: [checksummedAsset] },
          assetsPrice: {},
        }),
      });
      const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

      await middleware.assetsMiddleware(context, next);

      expect(
        context.response.assetsBalance?.[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_1],
      ).toStrictEqual({ amount: '1000' });
    });

    it('keeps staking contract balances', async () => {
      const middleware = setupDisabled();
      const context = createMiddlewareContext({
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_STAKING_ASSET]: { amount: '1.5' },
            },
          },
        },
      });
      const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

      await middleware.assetsMiddleware(context, next);

      expect(
        context.response.assetsBalance?.[MOCK_ACCOUNT_ID]?.[
          MOCK_STAKING_ASSET
        ],
      ).toStrictEqual({ amount: '1.5' });
    });

    it('does not queue prices for stripped tokens but still queues natives', async () => {
      const middleware = setupDisabled();
      const context = createMiddlewareContext({
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_ASSET_1]: { amount: '1000' },
              [MOCK_NATIVE_ASSET]: { amount: '2' },
            },
          },
        },
      });
      const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

      await middleware.assetsMiddleware(context, next);

      expect(context.request.assetsForPriceUpdate).toStrictEqual([
        normalizeAssetId(MOCK_NATIVE_ASSET),
      ]);
    });
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
