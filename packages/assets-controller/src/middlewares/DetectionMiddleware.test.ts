import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger } from '@metamask/messenger';
import type { MessengerActions } from '@metamask/messenger';

import type { DetectionMiddlewareMessenger } from './DetectionMiddleware';
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

function createDataRequest(overrides?: Partial<DataRequest>): DataRequest {
  return {
    chainIds: ['eip155:1'],
    accounts: [createMockAccount()],
    dataTypes: ['balance'],
    ...overrides,
  } as DataRequest;
}

function createAssetsState(
  metadataAssets: Caip19AssetId[] = [],
): AssetsControllerStateInternal {
  const assetsMetadata: Record<Caip19AssetId, { name: string }> = {};
  for (const assetId of metadataAssets) {
    assetsMetadata[assetId] = { name: `Asset ${assetId}` };
  }
  return {
    assetsMetadata,
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

type SetupResult = {
  middleware: DetectionMiddleware;
  messenger: DetectionMiddlewareMessenger;
};

function setupController(): SetupResult {
  const messenger = new Messenger<
    'DetectionMiddleware',
    MessengerActions<DetectionMiddlewareMessenger>,
    never
  >({
    namespace: 'DetectionMiddleware',
  });

  const middlewareInstance = new DetectionMiddleware({
    messenger,
  });

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

  it('registers getAssetsMiddleware action handler', () => {
    const { messenger } = setupController();

    const middlewareFn = messenger.call(
      'DetectionMiddleware:getAssetsMiddleware',
    );

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

  it('does not detect assets that have metadata', async () => {
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

    expect(context.response.detectedAssets).toBeUndefined();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('detects only assets without metadata in mixed scenario', async () => {
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
      [MOCK_ACCOUNT_ID]: [MOCK_ASSET_2, MOCK_NATIVE_ASSET],
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
      [account2Id]: [MOCK_ASSET_2],
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('skips accounts with no detected assets', async () => {
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

    expect(context.response.detectedAssets).toStrictEqual({
      [account2Id]: [MOCK_ASSET_2],
    });
    expect(context.response.detectedAssets?.[MOCK_ACCOUNT_ID]).toBeUndefined();
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

  it('retrieves middleware via messenger action', async () => {
    const { messenger } = setupController();
    const middlewareFn = messenger.call(
      'DetectionMiddleware:getAssetsMiddleware',
    );

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
