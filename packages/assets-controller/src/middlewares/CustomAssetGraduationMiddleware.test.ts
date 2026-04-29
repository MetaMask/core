import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  AssetsControllerStateInternal,
  Caip19AssetId,
  Context,
  DataRequest,
} from '../types';
import { CustomAssetGraduationMiddleware } from './CustomAssetGraduationMiddleware';

const MOCK_ACCOUNT_ID = 'mock-account-id';
const OTHER_ACCOUNT_ID = 'other-account-id';

// Checksummed addresses — customAssets state stores normalized IDs.
const EVM_CUSTOM_ASSET =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const EVM_OTHER_ASSET =
  'eip155:137/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7' as Caip19AssetId;
const SOLANA_CUSTOM_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Caip19AssetId;
const BTC_CUSTOM_ASSET =
  'bip122:000000000019d6689c085ae165831e93/slip44:0' as Caip19AssetId;

function createMockAccount(id = MOCK_ACCOUNT_ID): InternalAccount {
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

function createDataRequest(overrides?: Partial<DataRequest>): DataRequest {
  const chainIds = overrides?.chainIds ?? ['eip155:1'];
  const accounts = [createMockAccount()];
  return {
    chainIds,
    accountsWithSupportedChains: accounts.map((a) => ({
      account: a,
      supportedChains: chainIds,
    })),
    dataTypes: ['balance'],
    ...overrides,
  } as DataRequest;
}

function createAssetsState(
  customAssets: Record<string, Caip19AssetId[]> = {},
): AssetsControllerStateInternal {
  return {
    assetsInfo: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets,
    assetPreferences: {},
  } as AssetsControllerStateInternal;
}

function createContext(
  overrides?: Partial<Context>,
  customAssets: Record<string, Caip19AssetId[]> = {},
): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest.fn().mockReturnValue(createAssetsState(customAssets)),
    ...overrides,
  };
}

function setup(
  customAssets: Record<string, Caip19AssetId[]> = {},
  selectedAccountId: string | undefined = MOCK_ACCOUNT_ID,
): {
  middleware: CustomAssetGraduationMiddleware;
  context: Context;
  removeCustomAsset: jest.Mock;
  getSelectedAccountId: jest.Mock;
} {
  const removeCustomAsset = jest.fn();
  const getSelectedAccountId = jest.fn().mockReturnValue(selectedAccountId);
  const middleware = new CustomAssetGraduationMiddleware({
    getSelectedAccountId,
    removeCustomAsset,
  });
  const context = createContext({}, customAssets);
  return { middleware, context, removeCustomAsset, getSelectedAccountId };
}

describe('CustomAssetGraduationMiddleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct name', () => {
    const { middleware } = setup();
    expect(middleware.name).toBe('CustomAssetGraduationMiddleware');
    expect(middleware.getName()).toBe('CustomAssetGraduationMiddleware');
  });

  it('exposes an assetsMiddleware function', () => {
    const { middleware } = setup();
    expect(typeof middleware.assetsMiddleware).toBe('function');
  });

  it('graduates an EVM custom asset that was returned in the balance response', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
    });
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [EVM_CUSTOM_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
    expect(removeCustomAsset).toHaveBeenCalledTimes(1);
    expect(removeCustomAsset).toHaveBeenCalledWith(
      MOCK_ACCOUNT_ID,
      EVM_CUSTOM_ASSET,
    );
  });

  it('graduates only the returned subset of custom assets', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET, EVM_OTHER_ASSET],
    });
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [EVM_CUSTOM_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).toHaveBeenCalledTimes(1);
    expect(removeCustomAsset).toHaveBeenCalledWith(
      MOCK_ACCOUNT_ID,
      EVM_CUSTOM_ASSET,
    );
  });

  it('does not graduate non-EVM (Solana) custom assets', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [SOLANA_CUSTOM_ASSET],
    });
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [SOLANA_CUSTOM_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('does not graduate non-EVM (BTC) custom assets', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [BTC_CUSTOM_ASSET],
    });
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [BTC_CUSTOM_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('only graduates assets for the selected account', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
      [OTHER_ACCOUNT_ID]: [EVM_OTHER_ASSET],
    });
    context.response = {
      assetsBalance: {
        [OTHER_ACCOUNT_ID]: {
          [EVM_OTHER_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('is a no-op when the selected account has no custom assets', async () => {
    const { middleware, context, removeCustomAsset } = setup({});
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [EVM_CUSTOM_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('is a no-op when the response has no balances for the selected account', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
    });
    context.response = {
      assetsBalance: {},
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('is a no-op when the response is empty', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
    });
    context.response = {};
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no selected account', async () => {
    const { middleware, context, removeCustomAsset, getSelectedAccountId } =
      setup({ [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET] });
    getSelectedAccountId.mockReturnValue(undefined);
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [EVM_CUSTOM_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('does not graduate non-custom EVM assets that appear in the response', async () => {
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
    });
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [EVM_OTHER_ASSET]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('does not run for non-balance data types', async () => {
    const { middleware, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
    });
    const context = createContext(
      {
        request: createDataRequest({ dataTypes: ['metadata'] }),
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [EVM_CUSTOM_ASSET]: { amount: '1000' },
            },
          },
        },
      },
      { [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET] },
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('graduates a custom asset when the response uses a non-checksummed (lowercase) address', async () => {
    // Regression: BackendWebsocketDataSource does not normalize asset IDs,
    // so balances may arrive with lowercase addresses while customAssets
    // state stores the checksummed form. Graduation must be robust to that.
    const checksummedCustomAsset =
      'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
    const lowercaseFromWebsocket =
      'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;

    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [checksummedCustomAsset],
    });
    context.response = {
      assetsBalance: {
        [MOCK_ACCOUNT_ID]: {
          [lowercaseFromWebsocket]: { amount: '1000' },
        },
      },
    };
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).toHaveBeenCalledTimes(1);
    // Removal must use the canonical (checksummed) form stored in state.
    expect(removeCustomAsset).toHaveBeenCalledWith(
      MOCK_ACCOUNT_ID,
      checksummedCustomAsset,
    );
  });

  it('does not graduate when the matching balance is added by downstream middleware (e.g. RPC fallback)', async () => {
    // Regression test: the graduation middleware must inspect the response
    // BEFORE calling next() so that balances merged in by later middleware
    // (notably the RPC fallback, which intentionally fetches custom assets)
    // do not trigger graduation. See PR description for the resilience work.
    const { middleware, context, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
    });
    // No balance from upstream sources — AccountsApi did not return it.
    context.response = { assetsBalance: { [MOCK_ACCOUNT_ID]: {} } };
    // The downstream middleware (RPC fallback) populates the asset balance.
    const next = jest.fn().mockImplementation(async (ctx) => {
      ctx.response = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [EVM_CUSTOM_ASSET]: { amount: '1000' },
          },
        },
      };
      return ctx;
    });

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).not.toHaveBeenCalled();
  });

  it('runs when dataTypes includes balance among others', async () => {
    const { middleware, removeCustomAsset } = setup({
      [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET],
    });
    const context = createContext(
      {
        request: createDataRequest({ dataTypes: ['balance', 'metadata'] }),
        response: {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [EVM_CUSTOM_ASSET]: { amount: '1000' },
            },
          },
        },
      },
      { [MOCK_ACCOUNT_ID]: [EVM_CUSTOM_ASSET] },
    );
    const next = jest.fn().mockImplementation((ctx) => Promise.resolve(ctx));

    await middleware.assetsMiddleware(context, next);

    expect(removeCustomAsset).toHaveBeenCalledWith(
      MOCK_ACCOUNT_ID,
      EVM_CUSTOM_ASSET,
    );
  });
});
