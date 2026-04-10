import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { AuthenticatedUserStorageMessenger } from './authenticated-user-storage';
import {
  authenticatedStorageUrl,
  AuthenticatedUserStorageService,
} from './authenticated-user-storage';
import { Env, getEnvUrls } from './env';
import {
  handleMockListDelegations,
  handleMockCreateDelegation,
  handleMockRevokeDelegation,
  handleMockGetNotificationPreferences,
  handleMockPutNotificationPreferences,
} from '../tests/fixtures/authenticated-userstorage';
import {
  MOCK_DELEGATION_RESPONSE,
  MOCK_DELEGATION_SUBMISSION,
  MOCK_NOTIFICATION_PREFERENCES,
} from '../tests/mocks/authenticated-userstorage';

const MOCK_ACCESS_TOKEN = 'mock-access-token';

describe('getEnvUrls()', () => {
  it('returns URLs for a valid environment', () => {
    const result = getEnvUrls(Env.PRD);
    expect(result.userStorageApiUrl).toBe(
      'https://user-storage.api.cx.metamask.io',
    );
  });

  it('throws for an invalid environment', () => {
    expect(() => getEnvUrls('invalid' as Env)).toThrow(
      'invalid environment configuration',
    );
  });
});

describe('authenticatedStorageUrl()', () => {
  it('generates the base URL for a given environment', () => {
    const result = authenticatedStorageUrl(Env.PRD);
    expect(result).toBe('https://user-storage.api.cx.metamask.io/api/v1');
  });
});

describe('AuthenticatedUserStorageService', () => {
  describe('AuthenticatedUserStorageService:listDelegations', () => {
    it('returns delegation records via the messenger', async () => {
      handleMockListDelegations();
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AuthenticatedUserStorage:listDelegations',
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

  describe('authorization', () => {
    it('passes the access token as a Bearer header', async () => {
      handleMockListDelegations();
      const { service, mockGetAccessToken } = createService();

      await service.listDelegations();

      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
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
    namespace: 'AuthenticatedUserStorage',
    parent: rootMessenger,
  });
}

function createService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof AuthenticatedUserStorageService>[0]>;
} = {}): {
  service: AuthenticatedUserStorageService;
  rootMessenger: RootMessenger;
  messenger: AuthenticatedUserStorageMessenger;
  mockGetAccessToken: jest.Mock;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  const mockGetAccessToken = jest.fn().mockResolvedValue(MOCK_ACCESS_TOKEN);
  const service = new AuthenticatedUserStorageService({
    messenger,
    env: Env.PRD,
    getAccessToken: mockGetAccessToken,
    ...options,
  });

  return { service, rootMessenger, messenger, mockGetAccessToken };
}
