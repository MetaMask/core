import {
  handleMockListDelegations,
  handleMockCreateDelegation,
  handleMockRevokeDelegation,
  handleMockGetNotificationPreferences,
  handleMockPutNotificationPreferences,
} from './__fixtures__/authenticated-userstorage';
import {
  authenticatedStorageUrl,
  AuthenticatedUserStorage,
} from './authenticated-user-storage';
import { Env } from './env';
import { AuthenticatedUserStorageError } from './errors';
import {
  MOCK_DELEGATION_RESPONSE,
  MOCK_DELEGATION_SUBMISSION,
  MOCK_NOTIFICATION_PREFERENCES,
} from './mocks/authenticated-userstorage';

const MOCK_ACCESS_TOKEN = 'mock-access-token';

function arrangeAuthenticatedUserStorage(): {
  storage: AuthenticatedUserStorage;
  mockGetAccessToken: jest.Mock;
} {
  const mockGetAccessToken = jest.fn().mockResolvedValue(MOCK_ACCESS_TOKEN);
  const storage = new AuthenticatedUserStorage({
    env: Env.PRD,
    getAccessToken: mockGetAccessToken,
  });
  return { storage, mockGetAccessToken };
}

describe('AuthenticatedUserStorage - authenticatedStorageUrl()', () => {
  it('generates the base URL for a given environment', () => {
    const result = authenticatedStorageUrl(Env.PRD);
    expect(result).toBe('https://user-storage.api.cx.metamask.io/api/v1');
  });
});

describe('AuthenticatedUserStorage - delegations', () => {
  it('lists delegations', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    const mock = handleMockListDelegations();

    const result = await storage.delegations.list();

    expect(mock.isDone()).toBe(true);
    expect(result).toStrictEqual([MOCK_DELEGATION_RESPONSE]);
  });

  it('throws AuthenticatedUserStorageError when list fails', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockListDelegations({
      status: 500,
      body: { message: 'server error', error: 'internal' },
    });

    await expect(storage.delegations.list()).rejects.toThrow(
      AuthenticatedUserStorageError,
    );
  });

  it('creates a delegation', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    const mock = handleMockCreateDelegation();

    await storage.delegations.create(MOCK_DELEGATION_SUBMISSION);

    expect(mock.isDone()).toBe(true);
  });

  it('creates a delegation with clientType header', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    const mock = handleMockCreateDelegation();

    await storage.delegations.create(MOCK_DELEGATION_SUBMISSION, 'extension');

    expect(mock.isDone()).toBe(true);
  });

  it('throws AuthenticatedUserStorageError on 409 conflict when creating duplicate delegation', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockCreateDelegation({
      status: 409,
      body: { message: 'delegation already exists', error: 'conflict' },
    });

    await expect(
      storage.delegations.create(MOCK_DELEGATION_SUBMISSION),
    ).rejects.toThrow(AuthenticatedUserStorageError);
  });

  it('throws AuthenticatedUserStorageError when create fails', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockCreateDelegation({
      status: 400,
      body: { message: 'invalid body', error: 'bad_request' },
    });

    await expect(
      storage.delegations.create(MOCK_DELEGATION_SUBMISSION),
    ).rejects.toThrow(AuthenticatedUserStorageError);
  });

  it('revokes a delegation', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    const mock = handleMockRevokeDelegation();

    await storage.delegations.revoke(
      MOCK_DELEGATION_SUBMISSION.metadata.delegationHash,
    );

    expect(mock.isDone()).toBe(true);
  });

  it('throws AuthenticatedUserStorageError when revoke returns 404', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockRevokeDelegation({
      status: 404,
      body: { message: 'not found', error: 'not_found' },
    });

    await expect(storage.delegations.revoke('0xdeadbeef')).rejects.toThrow(
      AuthenticatedUserStorageError,
    );
  });

  it('throws AuthenticatedUserStorageError when revoke fails', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockRevokeDelegation({
      status: 500,
      body: { message: 'server error', error: 'internal' },
    });

    await expect(storage.delegations.revoke('0xdeadbeef')).rejects.toThrow(
      AuthenticatedUserStorageError,
    );
  });
});

describe('AuthenticatedUserStorage - preferences', () => {
  it('gets notification preferences', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    const mock = handleMockGetNotificationPreferences();

    const result = await storage.preferences.getNotifications();

    expect(mock.isDone()).toBe(true);
    expect(result).toStrictEqual(MOCK_NOTIFICATION_PREFERENCES);
  });

  it('returns null when notification preferences are not found', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockGetNotificationPreferences({ status: 404 });

    const result = await storage.preferences.getNotifications();

    expect(result).toBeNull();
  });

  it('throws AuthenticatedUserStorageError when get preferences fails', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockGetNotificationPreferences({
      status: 500,
      body: { message: 'server error', error: 'internal' },
    });

    await expect(storage.preferences.getNotifications()).rejects.toThrow(
      AuthenticatedUserStorageError,
    );
  });

  it('puts notification preferences', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    const mock = handleMockPutNotificationPreferences();

    await storage.preferences.putNotifications(MOCK_NOTIFICATION_PREFERENCES);

    expect(mock.isDone()).toBe(true);
  });

  it('puts notification preferences with clientType header', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    const mock = handleMockPutNotificationPreferences();

    await storage.preferences.putNotifications(
      MOCK_NOTIFICATION_PREFERENCES,
      'mobile',
    );

    expect(mock.isDone()).toBe(true);
  });

  it('sends the correct request body when putting preferences', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockPutNotificationPreferences(undefined, async (_, requestBody) => {
      expect(requestBody).toStrictEqual(MOCK_NOTIFICATION_PREFERENCES);
    });

    await storage.preferences.putNotifications(MOCK_NOTIFICATION_PREFERENCES);
  });

  it('throws AuthenticatedUserStorageError when put preferences fails', async () => {
    const { storage } = arrangeAuthenticatedUserStorage();
    handleMockPutNotificationPreferences({
      status: 400,
      body: { message: 'invalid body', error: 'bad_request' },
    });

    await expect(
      storage.preferences.putNotifications(MOCK_NOTIFICATION_PREFERENCES),
    ).rejects.toThrow(AuthenticatedUserStorageError);
  });
});

describe('AuthenticatedUserStorage - authorization', () => {
  it('passes the access token as a Bearer header', async () => {
    const { storage, mockGetAccessToken } = arrangeAuthenticatedUserStorage();
    handleMockListDelegations();

    await storage.delegations.list();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
  });
});
