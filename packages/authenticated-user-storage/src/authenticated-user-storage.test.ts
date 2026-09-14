import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import {
  handleMockListDelegations,
  handleMockCreateDelegation,
  handleMockRevokeDelegation,
  handleMockGetNotificationPreferences,
  handleMockPutNotificationPreferences,
  handleMockGetAssetsWatchlist,
  handleMockSetAssetsWatchlist,
  handleMockGetUserAssets,
  handleMockSetUserAssets,
} from '../tests/fixtures/authenticated-userstorage.js';
import {
  MOCK_DELEGATION_RESPONSE,
  MOCK_DELEGATION_SUBMISSION,
  MOCK_INVALID_ASSETS_WATCHLIST_BLOB,
  MOCK_NOTIFICATION_PREFERENCES,
  MOCK_ASSETS_WATCHLIST_BLOB,
  MOCK_ASSETS_WATCHLIST_URL,
  MOCK_USER_ASSETS_BLOB,
  MOCK_USER_ASSETS_URL,
  MOCK_INVALID_USER_ASSETS_BLOB,
} from '../tests/mocks/authenticated-userstorage.js';
import type { AuthenticatedUserStorageMessenger } from './authenticated-user-storage.js';
import {
  getAuthenticatedStorageUrl,
  AuthenticatedUserStorageService,
} from './authenticated-user-storage.js';
import type { Environment } from './env.js';
import { getUserStorageApiUrl } from './env.js';
import type { UserAssetsBlob } from './types.js';
import {
  ASSETS_WATCHLIST_MAX_ASSETS,
  normalizeUserAssetsBlob,
} from './validators.js';

const MOCK_ACCESS_TOKEN = 'mock-access-token';

const MOCK_USDC_ETH_ASSET_ID =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const MOCK_USDC_BASE_ASSET_ID =
  'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const MOCK_USDC_OP_ASSET_ID =
  'eip155:10/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce36000000';
const MOCK_USDC_POLYGON_ASSET_ID =
  'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const MOCK_INVALID_ASSET_ID = 'not-a-caip-19-asset-id';

describe('getUserStorageApiUrl()', () => {
  it('returns the API URL for a valid environment', () => {
    const result = getUserStorageApiUrl('prod');
    expect(result).toBe('https://user-storage.api.cx.metamask.io');
  });

  it('throws for an invalid environment', () => {
    expect(() => getUserStorageApiUrl('invalid' as Environment)).toThrow(
      'Invalid environment: invalid',
    );
  });
});

describe('getAuthenticatedStorageUrl()', () => {
  it('generates the base URL for a given environment', () => {
    const result = getAuthenticatedStorageUrl('prod');
    expect(result).toBe('https://user-storage.api.cx.metamask.io/api/v1');
  });
});

describe('normalizeUserAssetsBlob()', () => {
  it('de-duplicates entries, preserving first-occurrence order', () => {
    const result = normalizeUserAssetsBlob({
      version: 1,
      importedAssets: [
        MOCK_USDC_ETH_ASSET_ID,
        MOCK_USDC_ETH_ASSET_ID,
        MOCK_USDC_BASE_ASSET_ID,
      ],
      hiddenAssets: [MOCK_USDC_OP_ASSET_ID, MOCK_USDC_OP_ASSET_ID],
    });

    expect(result).toStrictEqual({
      version: 1,
      importedAssets: [MOCK_USDC_ETH_ASSET_ID, MOCK_USDC_BASE_ASSET_ID],
      hiddenAssets: [MOCK_USDC_OP_ASSET_ID],
    });
  });

  it('resolves conflicts fail-open: an identifier in both lists stays imported and is removed from hidden', () => {
    const result = normalizeUserAssetsBlob({
      version: 1,
      importedAssets: [MOCK_USDC_BASE_ASSET_ID],
      hiddenAssets: [MOCK_USDC_BASE_ASSET_ID, MOCK_USDC_OP_ASSET_ID],
    });

    expect(result).toStrictEqual({
      version: 1,
      importedAssets: [MOCK_USDC_BASE_ASSET_ID],
      hiddenAssets: [MOCK_USDC_OP_ASSET_ID],
    });
  });

  it('does not mutate the input blob', () => {
    const input = {
      version: 1 as const,
      importedAssets: [MOCK_USDC_ETH_ASSET_ID, MOCK_USDC_ETH_ASSET_ID],
      hiddenAssets: [MOCK_USDC_ETH_ASSET_ID],
    };

    normalizeUserAssetsBlob(input);

    expect(input).toStrictEqual({
      version: 1,
      importedAssets: [MOCK_USDC_ETH_ASSET_ID, MOCK_USDC_ETH_ASSET_ID],
      hiddenAssets: [MOCK_USDC_ETH_ASSET_ID],
    });
  });
});

describe('AuthenticatedUserStorageService', () => {
  afterEach(() => {
    nock.cleanAll(); // eslint-disable-line import-x/no-named-as-default-member
  });

  describe('AuthenticatedUserStorageService:listDelegations', () => {
    it('returns delegation records via the messenger', async () => {
      handleMockListDelegations();
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AuthenticatedUserStorageService:listDelegations',
      );

      expect(result).toStrictEqual([MOCK_DELEGATION_RESPONSE]);
    });
  });

  describe('listDelegations', () => {
    it('returns delegation records from the API', async () => {
      const mock = handleMockListDelegations();
      const { service } = createService();

      const result = await service.listDelegations();

      expect(mock.isDone()).toBe(true);
      expect(result).toStrictEqual([MOCK_DELEGATION_RESPONSE]);
    });

    it('throws when the API returns a non-200 status', async () => {
      handleMockListDelegations({ status: 500 });
      const { service } = createService();

      await expect(service.listDelegations()).rejects.toThrow(
        'Failed to list delegations: 500',
      );
    });
  });

  describe('createDelegation', () => {
    it('submits a delegation to the API', async () => {
      const mock = handleMockCreateDelegation();
      const { service } = createService();

      await service.createDelegation(MOCK_DELEGATION_SUBMISSION);

      expect(mock.isDone()).toBe(true);
    });

    it('includes X-Client-Type header when clientType is provided', async () => {
      const mock = handleMockCreateDelegation();
      const { service } = createService();

      await service.createDelegation(MOCK_DELEGATION_SUBMISSION, 'extension');

      expect(mock.isDone()).toBe(true);
    });

    it('throws when the API returns a 409 conflict', async () => {
      handleMockCreateDelegation({ status: 409 });
      const { service } = createService();

      await expect(
        service.createDelegation(MOCK_DELEGATION_SUBMISSION),
      ).rejects.toThrow('Failed to create delegation: 409');
    });

    it('throws when the API returns a non-200 status', async () => {
      handleMockCreateDelegation({ status: 400 });
      const { service } = createService();

      await expect(
        service.createDelegation(MOCK_DELEGATION_SUBMISSION),
      ).rejects.toThrow('Failed to create delegation: 400');
    });

    it('sends the correct request body', async () => {
      handleMockCreateDelegation(undefined, async (_, requestBody) => {
        expect(requestBody).toStrictEqual(MOCK_DELEGATION_SUBMISSION);
      });
      const { service } = createService();

      await service.createDelegation(MOCK_DELEGATION_SUBMISSION);
    });
  });

  describe('revokeDelegation', () => {
    it('revokes a delegation via the API', async () => {
      const mock = handleMockRevokeDelegation();
      const { service } = createService();

      await service.revokeDelegation(
        MOCK_DELEGATION_SUBMISSION.metadata.delegationHash,
      );

      expect(mock.isDone()).toBe(true);
    });

    it('throws when the API returns a 404', async () => {
      handleMockRevokeDelegation({ status: 404 });
      const { service } = createService();

      await expect(service.revokeDelegation('0xdeadbeef')).rejects.toThrow(
        'Failed to revoke delegation: 404',
      );
    });

    it('throws when the API returns a non-200 status', async () => {
      handleMockRevokeDelegation({ status: 500 });
      const { service } = createService();

      await expect(service.revokeDelegation('0xdeadbeef')).rejects.toThrow(
        'Failed to revoke delegation: 500',
      );
    });
  });

  describe('getNotificationPreferences', () => {
    it('returns notification preferences from the API', async () => {
      const mock = handleMockGetNotificationPreferences();
      const { service } = createService();

      const result = await service.getNotificationPreferences();

      expect(mock.isDone()).toBe(true);
      expect(result).toStrictEqual(MOCK_NOTIFICATION_PREFERENCES);
    });

    it('returns null when preferences are not found', async () => {
      handleMockGetNotificationPreferences({ status: 404 });
      const { service } = createService();

      const result = await service.getNotificationPreferences();

      expect(result).toBeNull();
    });

    it('throws when the API returns a non-200/404 status', async () => {
      handleMockGetNotificationPreferences({ status: 500 });
      const { service } = createService();

      await expect(service.getNotificationPreferences()).rejects.toThrow(
        'Failed to get notification preferences: 500',
      );
    });
  });

  describe('putNotificationPreferences', () => {
    it('submits notification preferences to the API', async () => {
      const mock = handleMockPutNotificationPreferences();
      const { service } = createService();

      await service.putNotificationPreferences(MOCK_NOTIFICATION_PREFERENCES);

      expect(mock.isDone()).toBe(true);
    });

    it('includes X-Client-Type header when clientType is provided', async () => {
      const mock = handleMockPutNotificationPreferences();
      const { service } = createService();

      await service.putNotificationPreferences(
        MOCK_NOTIFICATION_PREFERENCES,
        'mobile',
      );

      expect(mock.isDone()).toBe(true);
    });

    it('sends the correct request body', async () => {
      handleMockPutNotificationPreferences(
        undefined,
        async (_, requestBody) => {
          expect(requestBody).toStrictEqual(MOCK_NOTIFICATION_PREFERENCES);
        },
      );
      const { service } = createService();

      await service.putNotificationPreferences(MOCK_NOTIFICATION_PREFERENCES);
    });

    it('throws when the API returns a non-200 status', async () => {
      handleMockPutNotificationPreferences({ status: 400 });
      const { service } = createService();

      await expect(
        service.putNotificationPreferences(MOCK_NOTIFICATION_PREFERENCES),
      ).rejects.toThrow('Failed to put notification preferences: 400');
    });
  });

  describe('AuthenticatedUserStorageService:getAssetsWatchlist', () => {
    it('returns the assets-watchlist via the messenger', async () => {
      handleMockGetAssetsWatchlist();
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AuthenticatedUserStorageService:getAssetsWatchlist',
      );

      expect(result).toStrictEqual(MOCK_ASSETS_WATCHLIST_BLOB);
    });
  });

  describe('AuthenticatedUserStorageService:setAssetsWatchlist', () => {
    it('sets the assets-watchlist via the messenger', async () => {
      const mock = handleMockSetAssetsWatchlist();
      const { rootMessenger } = createService();

      await rootMessenger.call(
        'AuthenticatedUserStorageService:setAssetsWatchlist',
        MOCK_ASSETS_WATCHLIST_BLOB,
      );

      expect(mock.isDone()).toBe(true);
    });
  });

  describe('getAssetsWatchlist', () => {
    it('returns the assets-watchlist from the API', async () => {
      const mock = handleMockGetAssetsWatchlist();
      const { service } = createService();

      const result = await service.getAssetsWatchlist();

      expect(mock.isDone()).toBe(true);
      expect(result).toStrictEqual(MOCK_ASSETS_WATCHLIST_BLOB);
    });

    it('sends the Authorization header', async () => {
      const scope = nock(MOCK_ASSETS_WATCHLIST_URL, {
        reqheaders: {
          authorization: 'Bearer mock-access-token',
        },
      })
        .get('')
        .reply(200, MOCK_ASSETS_WATCHLIST_BLOB);

      const { service } = createService();
      const result = await service.getAssetsWatchlist();

      expect(scope.isDone()).toBe(true);
      expect(result).toStrictEqual(MOCK_ASSETS_WATCHLIST_BLOB);
    });

    it('returns null when the assets-watchlist is not found', async () => {
      handleMockGetAssetsWatchlist({ status: 404 });
      const { service } = createService();

      const result = await service.getAssetsWatchlist();

      expect(result).toBeNull();
    });

    it('throws when the API returns a non-200/404 status', async () => {
      handleMockGetAssetsWatchlist({ status: 500 });
      const { service } = createService();

      await expect(service.getAssetsWatchlist()).rejects.toThrow(
        'Failed to get assets watchlist: 500',
      );
    });

    it('throws when the API returns a 401', async () => {
      handleMockGetAssetsWatchlist({ status: 401 });
      const { service } = createService();

      await expect(service.getAssetsWatchlist()).rejects.toThrow(
        'Failed to get assets watchlist: 401',
      );
    });

    it('throws when the response body is malformed', async () => {
      handleMockGetAssetsWatchlist({
        status: 200,
        body: MOCK_INVALID_ASSETS_WATCHLIST_BLOB,
      });
      const { service } = createService();

      await expect(service.getAssetsWatchlist()).rejects.toThrow(
        /Expected.*but received/u,
      );
    });

    it('caches the result so a second call within staleTime does not re-fetch', async () => {
      const scope = nock(MOCK_ASSETS_WATCHLIST_URL)
        .get('')
        .once()
        .reply(200, MOCK_ASSETS_WATCHLIST_BLOB);
      const { service } = createService();

      const first = await service.getAssetsWatchlist();
      const second = await service.getAssetsWatchlist();

      expect(scope.isDone()).toBe(true);
      expect(first).toStrictEqual(MOCK_ASSETS_WATCHLIST_BLOB);
      expect(second).toStrictEqual(MOCK_ASSETS_WATCHLIST_BLOB);
    });
  });

  describe('setAssetsWatchlist', () => {
    it('submits the assets-watchlist to the API', async () => {
      const mock = handleMockSetAssetsWatchlist();
      const { service } = createService();

      await service.setAssetsWatchlist(MOCK_ASSETS_WATCHLIST_BLOB);

      expect(mock.isDone()).toBe(true);
    });

    it('sends the correct request body', async () => {
      handleMockSetAssetsWatchlist(undefined, async (_, requestBody) => {
        expect(requestBody).toStrictEqual(MOCK_ASSETS_WATCHLIST_BLOB);
      });
      const { service } = createService();

      await service.setAssetsWatchlist(MOCK_ASSETS_WATCHLIST_BLOB);
    });

    it('sends Content-Type and Authorization headers but no X-Client-Type when clientType is omitted', async () => {
      const scope = nock(MOCK_ASSETS_WATCHLIST_URL, {
        reqheaders: {
          'content-type': 'application/json',
          authorization: 'Bearer mock-access-token',
        },
        badheaders: ['x-client-type'],
      })
        .put('')
        .reply(200);
      const { service } = createService();

      await service.setAssetsWatchlist(MOCK_ASSETS_WATCHLIST_BLOB);

      expect(scope.isDone()).toBe(true);
    });

    it('includes X-Client-Type header when clientType is provided', async () => {
      const scope = nock(MOCK_ASSETS_WATCHLIST_URL, {
        reqheaders: {
          'x-client-type': 'extension',
        },
      })
        .put('')
        .reply(200);
      const { service } = createService();

      await service.setAssetsWatchlist(MOCK_ASSETS_WATCHLIST_BLOB, 'extension');

      expect(scope.isDone()).toBe(true);
    });

    it('throws when the API returns a non-200 status', async () => {
      handleMockSetAssetsWatchlist({ status: 400 });
      const { service } = createService();

      await expect(
        service.setAssetsWatchlist(MOCK_ASSETS_WATCHLIST_BLOB),
      ).rejects.toThrow('Failed to put assets watchlist: 400');
    });

    it(`throws synchronously when the blob exceeds ${ASSETS_WATCHLIST_MAX_ASSETS} assets`, async () => {
      const { service } = createService();
      const oversized = {
        version: 1 as const,
        assets: Array.from(
          { length: ASSETS_WATCHLIST_MAX_ASSETS + 1 },
          (_, index) =>
            `eip155:1/erc20:0x${index.toString(16).padStart(40, '0')}`,
        ),
      };

      await expect(service.setAssetsWatchlist(oversized)).rejects.toThrow(
        new RegExp(
          `At path: assets -- Expected a array with a length between \`0\` and \`${ASSETS_WATCHLIST_MAX_ASSETS}\` but received one with a length of \`${ASSETS_WATCHLIST_MAX_ASSETS + 1}\``,
          'u',
        ),
      );
    });

    it('throws a structural error before sending the request when the blob is malformed', async () => {
      const { service } = createService();
      const malformed = {
        version: 2,
        assets: ['eip155:1/slip44:60'],
      } as unknown as Parameters<typeof service.setAssetsWatchlist>[0];

      await expect(service.setAssetsWatchlist(malformed)).rejects.toThrow(
        /At path: version -- Expected the literal/u,
      );
    });

    it(`accepts a blob with exactly ${ASSETS_WATCHLIST_MAX_ASSETS} assets`, async () => {
      const mock = handleMockSetAssetsWatchlist();
      const { service } = createService();
      const maxBlob = {
        version: 1 as const,
        assets: Array.from(
          { length: ASSETS_WATCHLIST_MAX_ASSETS },
          (_, index) =>
            `eip155:1/erc20:0x${index.toString(16).padStart(40, '0')}`,
        ),
      };

      await service.setAssetsWatchlist(maxBlob);

      expect(mock.isDone()).toBe(true);
    });
  });

  describe('AuthenticatedUserStorageService:getUserAssets', () => {
    it('returns the user-assets blob via the messenger', async () => {
      handleMockGetUserAssets();
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AuthenticatedUserStorageService:getUserAssets',
      );

      expect(result).toStrictEqual(MOCK_USER_ASSETS_BLOB);
    });
  });

  describe('AuthenticatedUserStorageService:setUserAssets', () => {
    it('sets the user-assets blob via the messenger', async () => {
      const mock = handleMockSetUserAssets();
      const { rootMessenger } = createService();

      await rootMessenger.call(
        'AuthenticatedUserStorageService:setUserAssets',
        MOCK_USER_ASSETS_BLOB,
      );

      expect(mock.isDone()).toBe(true);
    });
  });

  describe('AuthenticatedUserStorageService:importTokens', () => {
    it('imports tokens via the messenger', async () => {
      handleMockGetUserAssets();
      const mock = handleMockSetUserAssets();
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AuthenticatedUserStorageService:importTokens',
        [MOCK_USDC_POLYGON_ASSET_ID],
      );

      expect(mock.isDone()).toBe(true);
      expect(result?.importedAssets).toContain(MOCK_USDC_POLYGON_ASSET_ID);
      expect(result?.hiddenAssets).toStrictEqual([MOCK_USDC_OP_ASSET_ID]);
    });
  });

  describe('AuthenticatedUserStorageService:hideTokens', () => {
    it('hides tokens via the messenger', async () => {
      handleMockGetUserAssets();
      const mock = handleMockSetUserAssets();
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AuthenticatedUserStorageService:hideTokens',
        [MOCK_USDC_ETH_ASSET_ID],
      );

      expect(mock.isDone()).toBe(true);
      expect(result?.hiddenAssets).toContain(MOCK_USDC_ETH_ASSET_ID);
      expect(result?.importedAssets).toStrictEqual([MOCK_USDC_BASE_ASSET_ID]);
    });
  });

  describe('getUserAssets', () => {
    it('returns the user-assets blob from the API', async () => {
      const mock = handleMockGetUserAssets();
      const { service } = createService();

      const result = await service.getUserAssets();

      expect(mock.isDone()).toBe(true);
      expect(result).toStrictEqual(MOCK_USER_ASSETS_BLOB);
    });

    it('sends the Authorization header', async () => {
      const scope = nock(MOCK_USER_ASSETS_URL, {
        reqheaders: {
          authorization: 'Bearer mock-access-token',
        },
      })
        .get('')
        .reply(200, MOCK_USER_ASSETS_BLOB);

      const { service } = createService();
      const result = await service.getUserAssets();

      expect(scope.isDone()).toBe(true);
      expect(result).toStrictEqual(MOCK_USER_ASSETS_BLOB);
    });

    it('returns null when the user-assets blob is not found', async () => {
      handleMockGetUserAssets({ status: 404 });
      const { service } = createService();

      const result = await service.getUserAssets();

      expect(result).toBeNull();
    });

    it.each([401, 500])('throws when the API returns a %s', async (status) => {
      handleMockGetUserAssets({ status });
      const { service } = createService();

      await expect(service.getUserAssets()).rejects.toThrow(
        `Failed to get user assets: ${status}`,
      );
    });

    it('throws when the response body is malformed', async () => {
      handleMockGetUserAssets({
        status: 200,
        body: MOCK_INVALID_USER_ASSETS_BLOB,
      });
      const { service } = createService();

      await expect(service.getUserAssets()).rejects.toThrow(
        /Expected.*but received/u,
      );
    });

    it('caches the result so a second call within staleTime does not re-fetch', async () => {
      const scope = nock(MOCK_USER_ASSETS_URL)
        .get('')
        .once()
        .reply(200, MOCK_USER_ASSETS_BLOB);
      const { service } = createService();

      const first = await service.getUserAssets();
      const second = await service.getUserAssets();

      expect(scope.isDone()).toBe(true);
      expect(first).toStrictEqual(MOCK_USER_ASSETS_BLOB);
      expect(second).toStrictEqual(MOCK_USER_ASSETS_BLOB);
    });
  });

  describe('setUserAssets', () => {
    it('submits the user-assets blob to the API', async () => {
      const mock = handleMockSetUserAssets();
      const { service } = createService();

      await service.setUserAssets(MOCK_USER_ASSETS_BLOB);

      expect(mock.isDone()).toBe(true);
    });

    it('sends the correct request body', async () => {
      handleMockSetUserAssets(undefined, async (_, requestBody) => {
        expect(requestBody).toStrictEqual(MOCK_USER_ASSETS_BLOB);
      });
      const { service } = createService();

      await service.setUserAssets(MOCK_USER_ASSETS_BLOB);
    });

    it('sends Content-Type and Authorization headers but no X-Client-Type when clientType is omitted', async () => {
      const scope = nock(MOCK_USER_ASSETS_URL, {
        reqheaders: {
          'content-type': 'application/json',
          authorization: 'Bearer mock-access-token',
        },
        badheaders: ['x-client-type'],
      })
        .put('')
        .reply(200);
      const { service } = createService();

      await service.setUserAssets(MOCK_USER_ASSETS_BLOB);

      expect(scope.isDone()).toBe(true);
    });

    it('includes X-Client-Type header when clientType is provided', async () => {
      const scope = nock(MOCK_USER_ASSETS_URL, {
        reqheaders: {
          'x-client-type': 'extension',
        },
      })
        .put('')
        .reply(200);
      const { service } = createService();

      await service.setUserAssets(MOCK_USER_ASSETS_BLOB, 'extension');

      expect(scope.isDone()).toBe(true);
    });

    it('throws when the API returns a non-200 status', async () => {
      handleMockSetUserAssets({ status: 400 });
      const { service } = createService();

      await expect(
        service.setUserAssets(MOCK_USER_ASSETS_BLOB),
      ).rejects.toThrow('Failed to put user assets: 400');
    });

    it.each([
      {
        name: 'the blob version is not 1',
        blob: {
          version: 2,
          importedAssets: [MOCK_USDC_ETH_ASSET_ID],
          hiddenAssets: [],
        },
        expectedError: /At path: version -- Expected the literal/u,
      },
      {
        name: 'an importedAssets entry is not a CAIP-19 asset identifier',
        blob: {
          version: 1,
          importedAssets: [MOCK_USDC_ETH_ASSET_ID, MOCK_INVALID_ASSET_ID],
          hiddenAssets: [],
        },
        expectedError:
          /At path: importedAssets\.1 -- Expected a value of type `CaipAssetType`/u,
      },
      {
        name: 'a hiddenAssets entry is not a CAIP-19 asset identifier',
        blob: {
          version: 1,
          importedAssets: [],
          hiddenAssets: [MOCK_INVALID_ASSET_ID],
        },
        expectedError:
          /At path: hiddenAssets\.0 -- Expected a value of type `CaipAssetType`/u,
      },
    ])(
      'throws a structural error before sending the request when $name',
      async ({ blob, expectedError }) => {
        const { service } = createService();

        await expect(
          service.setUserAssets(
            blob as unknown as Parameters<typeof service.setUserAssets>[0],
          ),
        ).rejects.toThrow(expectedError);
      },
    );

    it('de-duplicates entries before sending the request', async () => {
      handleMockSetUserAssets(undefined, async (_, requestBody) => {
        expect(requestBody).toStrictEqual({
          version: 1,
          importedAssets: [MOCK_USDC_ETH_ASSET_ID, MOCK_USDC_BASE_ASSET_ID],
          hiddenAssets: [MOCK_USDC_OP_ASSET_ID],
        });
      });
      const { service } = createService();

      await service.setUserAssets({
        version: 1 as const,
        importedAssets: [
          MOCK_USDC_ETH_ASSET_ID,
          MOCK_USDC_ETH_ASSET_ID,
          MOCK_USDC_BASE_ASSET_ID,
        ],
        hiddenAssets: [MOCK_USDC_OP_ASSET_ID, MOCK_USDC_OP_ASSET_ID],
      });
    });

    it('resolves conflicts fail-open (import wins) before sending the request', async () => {
      handleMockSetUserAssets(undefined, async (_, requestBody) => {
        expect(requestBody).toStrictEqual({
          version: 1,
          importedAssets: [MOCK_USDC_BASE_ASSET_ID],
          hiddenAssets: [],
        });
      });
      const { service } = createService();

      await service.setUserAssets({
        version: 1 as const,
        // Deliberately present in both lists: import must win.
        importedAssets: [MOCK_USDC_BASE_ASSET_ID],
        hiddenAssets: [MOCK_USDC_BASE_ASSET_ID],
      });
    });
  });

  describe('importTokens / hideTokens', () => {
    it.each([
      {
        method: 'importTokens',
        ids: [MOCK_USDC_ETH_ASSET_ID],
        expectedBlob: {
          version: 1,
          importedAssets: [MOCK_USDC_ETH_ASSET_ID],
          hiddenAssets: [],
        },
      },
      {
        method: 'hideTokens',
        ids: [MOCK_USDC_OP_ASSET_ID],
        expectedBlob: {
          version: 1,
          importedAssets: [],
          hiddenAssets: [MOCK_USDC_OP_ASSET_ID],
        },
      },
    ] as const)(
      '$method creates a fresh blob when none exists (404)',
      async ({ method, ids, expectedBlob }) => {
        handleMockGetUserAssets({ status: 404 });
        handleMockSetUserAssets(undefined, async (_, requestBody) => {
          expect(requestBody).toStrictEqual(expectedBlob);
        });
        const { service } = createService();

        const result = await service[method]([...ids]);

        expect(result).toStrictEqual(expectedBlob);
      },
    );

    it.each([
      {
        method: 'importTokens',
        addedList: 'importedAssets',
        ids: [MOCK_USDC_ETH_ASSET_ID, MOCK_USDC_POLYGON_ASSET_ID],
        expectedList: [
          MOCK_USDC_ETH_ASSET_ID,
          MOCK_USDC_BASE_ASSET_ID,
          MOCK_USDC_POLYGON_ASSET_ID,
        ],
        expectedRequest: {
          version: 1,
          importedAssets: [
            MOCK_USDC_ETH_ASSET_ID,
            MOCK_USDC_BASE_ASSET_ID,
            MOCK_USDC_POLYGON_ASSET_ID,
          ],
          hiddenAssets: [MOCK_USDC_OP_ASSET_ID],
        },
      },
      {
        method: 'hideTokens',
        addedList: 'hiddenAssets',
        ids: [MOCK_USDC_OP_ASSET_ID, MOCK_USDC_POLYGON_ASSET_ID],
        expectedList: [MOCK_USDC_OP_ASSET_ID, MOCK_USDC_POLYGON_ASSET_ID],
        expectedRequest: {
          version: 1,
          importedAssets: [MOCK_USDC_ETH_ASSET_ID, MOCK_USDC_BASE_ASSET_ID],
          hiddenAssets: [MOCK_USDC_OP_ASSET_ID, MOCK_USDC_POLYGON_ASSET_ID],
        },
      },
    ] as const)(
      '$method merges into the existing list, de-duplicating entries',
      async ({ method, addedList, ids, expectedList, expectedRequest }) => {
        handleMockGetUserAssets();
        handleMockSetUserAssets(undefined, async (_, requestBody) => {
          expect(requestBody).toStrictEqual(expectedRequest);
        });
        const { service } = createService();

        const result = await service[method]([...ids]);

        expect(result[addedList]).toStrictEqual(expectedList);
      },
    );

    it.each([
      {
        method: 'importTokens',
        ids: [MOCK_USDC_OP_ASSET_ID],
        expectedRequest: {
          version: 1,
          importedAssets: [
            MOCK_USDC_ETH_ASSET_ID,
            MOCK_USDC_BASE_ASSET_ID,
            MOCK_USDC_OP_ASSET_ID,
          ],
          hiddenAssets: [],
        },
      },
      {
        method: 'hideTokens',
        ids: [MOCK_USDC_ETH_ASSET_ID],
        expectedRequest: {
          version: 1,
          importedAssets: [MOCK_USDC_BASE_ASSET_ID],
          hiddenAssets: [MOCK_USDC_OP_ASSET_ID, MOCK_USDC_ETH_ASSET_ID],
        },
      },
    ] as const)(
      '$method removes the tokens from the opposite list (mutual exclusivity)',
      async ({ method, ids, expectedRequest }) => {
        handleMockGetUserAssets();
        handleMockSetUserAssets(undefined, async (_, requestBody) => {
          expect(requestBody).toStrictEqual(expectedRequest);
        });
        const { service } = createService();

        const result = await service[method]([...ids]);

        expect(result.importedAssets).toStrictEqual(
          expectedRequest.importedAssets,
        );
        expect(result.hiddenAssets).toStrictEqual(expectedRequest.hiddenAssets);
      },
    );

    it.each(['importTokens', 'hideTokens'] as const)(
      '%s throws before any request when an entry is not a CAIP-19 asset identifier',
      async (method) => {
        const getScope = nock(MOCK_USER_ASSETS_URL)
          .get('')
          .reply(200, MOCK_USER_ASSETS_BLOB);
        const { service } = createService();

        await expect(service[method]([MOCK_INVALID_ASSET_ID])).rejects.toThrow(
          /At path: 0 -- Expected a value of type `CaipAssetType`/u,
        );

        expect(getScope.isDone()).toBe(false);
      },
    );

    it.each([
      { method: 'importTokens', clientType: 'extension' },
      { method: 'hideTokens', clientType: 'mobile' },
    ] as const)(
      '$method includes the X-Client-Type header when clientType is provided',
      async ({ method, clientType }) => {
        handleMockGetUserAssets();
        const scope = nock(MOCK_USER_ASSETS_URL, {
          reqheaders: {
            'x-client-type': clientType,
          },
        })
          .put('')
          .reply(200);
        const { service } = createService();

        await service[method]([MOCK_USDC_ETH_ASSET_ID], clientType);

        expect(scope.isDone()).toBe(true);
      },
    );
  });

  describe('cache invalidation', () => {
    it('invalidates listDelegations cache after createDelegation', async () => {
      handleMockCreateDelegation();
      handleMockListDelegations();
      const { service } = createService();
      const invalidateSpy = jest.spyOn(service, 'invalidateQueries');

      await service.createDelegation(MOCK_DELEGATION_SUBMISSION);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['AuthenticatedUserStorageService:listDelegations'],
      });
    });

    it('invalidates listDelegations cache after revokeDelegation', async () => {
      handleMockRevokeDelegation();
      handleMockListDelegations();
      const { service } = createService();
      const invalidateSpy = jest.spyOn(service, 'invalidateQueries');

      await service.revokeDelegation(
        MOCK_DELEGATION_SUBMISSION.metadata.delegationHash,
      );

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['AuthenticatedUserStorageService:listDelegations'],
      });
    });

    it('invalidates getNotificationPreferences cache after putNotificationPreferences', async () => {
      handleMockPutNotificationPreferences();
      handleMockGetNotificationPreferences();
      const { service } = createService();
      const invalidateSpy = jest.spyOn(service, 'invalidateQueries');

      await service.putNotificationPreferences(MOCK_NOTIFICATION_PREFERENCES);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [
          'AuthenticatedUserStorageService:getNotificationPreferences',
        ],
      });
    });

    it('invalidates getAssetsWatchlist cache after setAssetsWatchlist', async () => {
      handleMockSetAssetsWatchlist();
      handleMockGetAssetsWatchlist();
      const { service } = createService();
      const invalidateSpy = jest.spyOn(service, 'invalidateQueries');

      await service.setAssetsWatchlist(MOCK_ASSETS_WATCHLIST_BLOB);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['AuthenticatedUserStorageService:getAssetsWatchlist'],
      });
    });

    it('causes a subsequent getAssetsWatchlist to refetch after setAssetsWatchlist', async () => {
      const updatedBlob = {
        version: 1 as const,
        assets: ['eip155:137/slip44:966'],
      };
      const getScope = nock(MOCK_ASSETS_WATCHLIST_URL)
        .get('')
        .reply(200, MOCK_ASSETS_WATCHLIST_BLOB)
        .put('')
        .reply(200)
        .get('')
        .reply(200, updatedBlob);

      const { service } = createService();
      const first = await service.getAssetsWatchlist();
      await service.setAssetsWatchlist(updatedBlob);
      const second = await service.getAssetsWatchlist();

      expect(getScope.isDone()).toBe(true);
      expect(first).toStrictEqual(MOCK_ASSETS_WATCHLIST_BLOB);
      expect(second).toStrictEqual(updatedBlob);
    });

    it.each([
      {
        mutator: 'setUserAssets',
        seedGet: false,
        run: (service: AuthenticatedUserStorageService): Promise<void> =>
          service.setUserAssets(MOCK_USER_ASSETS_BLOB),
      },
      {
        mutator: 'importTokens',
        seedGet: true,
        run: (
          service: AuthenticatedUserStorageService,
        ): Promise<UserAssetsBlob> =>
          service.importTokens([MOCK_USDC_POLYGON_ASSET_ID]),
      },
      {
        mutator: 'hideTokens',
        seedGet: true,
        run: (
          service: AuthenticatedUserStorageService,
        ): Promise<UserAssetsBlob> =>
          service.hideTokens([MOCK_USDC_ETH_ASSET_ID]),
      },
    ])(
      'invalidates the getUserAssets cache after $mutator',
      async ({ seedGet, run }) => {
        if (seedGet) {
          handleMockGetUserAssets();
        }
        handleMockSetUserAssets();
        const { service } = createService();
        const invalidateSpy = jest.spyOn(service, 'invalidateQueries');

        await run(service);

        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ['AuthenticatedUserStorageService:getUserAssets'],
        });
      },
    );

    it('causes a subsequent getUserAssets to refetch after setUserAssets', async () => {
      const updatedBlob = {
        version: 1 as const,
        importedAssets: [MOCK_USDC_POLYGON_ASSET_ID],
        hiddenAssets: [],
      };
      const getScope = nock(MOCK_USER_ASSETS_URL)
        .get('')
        .reply(200, MOCK_USER_ASSETS_BLOB)
        .put('')
        .reply(200)
        .get('')
        .reply(200, updatedBlob);

      const { service } = createService();
      const first = await service.getUserAssets();
      await service.setUserAssets(updatedBlob);
      const second = await service.getUserAssets();

      expect(getScope.isDone()).toBe(true);
      expect(first).toStrictEqual(MOCK_USER_ASSETS_BLOB);
      expect(second).toStrictEqual(updatedBlob);
    });
  });

  describe('authorization', () => {
    it('passes the access token as a Bearer header', async () => {
      handleMockListDelegations();
      const { service, mockGetBearerToken } = createService();

      await service.listDelegations();

      expect(mockGetBearerToken).toHaveBeenCalledTimes(1);
    });
  });
});

// === Test helpers ===

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<AuthenticatedUserStorageMessenger>,
  MessengerEvents<AuthenticatedUserStorageMessenger>
>;

function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createServiceMessenger(
  rootMessenger: RootMessenger,
): AuthenticatedUserStorageMessenger {
  return new Messenger({
    namespace: 'AuthenticatedUserStorageService',
    parent: rootMessenger,
  });
}

function createService({
  options = {},
}: {
  options?: Partial<
    ConstructorParameters<typeof AuthenticatedUserStorageService>[0]
  >;
} = {}): {
  service: AuthenticatedUserStorageService;
  rootMessenger: RootMessenger;
  messenger: AuthenticatedUserStorageMessenger;
  mockGetBearerToken: jest.Mock;
} {
  const rootMessenger = createRootMessenger();
  const mockGetBearerToken = jest.fn().mockResolvedValue(MOCK_ACCESS_TOKEN);
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    mockGetBearerToken,
  );
  const messenger = createServiceMessenger(rootMessenger);
  rootMessenger.delegate({
    messenger,
    actions: ['AuthenticationController:getBearerToken'],
  });
  const service = new AuthenticatedUserStorageService({
    messenger,
    environment: 'prod',
    ...options,
  });

  return { service, rootMessenger, messenger, mockGetBearerToken };
}
