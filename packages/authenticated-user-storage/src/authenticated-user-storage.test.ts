import { jest } from '@jest/globals';
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
} from '../tests/fixtures/authenticated-userstorage.js';
import {
  MOCK_DELEGATION_RESPONSE,
  MOCK_DELEGATION_SUBMISSION,
  MOCK_INVALID_ASSETS_WATCHLIST_BLOB,
  MOCK_NOTIFICATION_PREFERENCES,
  MOCK_ASSETS_WATCHLIST_BLOB,
  MOCK_ASSETS_WATCHLIST_URL,
} from '../tests/mocks/authenticated-userstorage.js';
import type { AuthenticatedUserStorageMessenger } from './authenticated-user-storage.js';
import {
  getAuthenticatedStorageUrl,
  AuthenticatedUserStorageService,
} from './authenticated-user-storage.js';
import type { Environment } from './env.js';
import { getUserStorageApiUrl } from './env.js';
import { ASSETS_WATCHLIST_MAX_ASSETS } from './validators.js';

const MOCK_ACCESS_TOKEN = 'mock-access-token';

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
