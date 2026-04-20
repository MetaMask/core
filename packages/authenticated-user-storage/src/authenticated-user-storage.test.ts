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
} from '../tests/fixtures/authenticated-userstorage';
import {
  MOCK_DELEGATION_RESPONSE,
  MOCK_DELEGATION_SUBMISSION,
  MOCK_NOTIFICATION_PREFERENCES,
} from '../tests/mocks/authenticated-userstorage';
import type { AuthenticatedUserStorageMessenger } from './authenticated-user-storage';
import {
  getAuthenticatedStorageUrl,
  AuthenticatedUserStorageService,
} from './authenticated-user-storage';
import type { Environment } from './env';
import { getUserStorageApiUrl } from './env';

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
