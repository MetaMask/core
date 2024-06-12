import {
  MOCK_USER_STORAGE_ACCOUNT,
  MOCK_USER_STORAGE_CHAIN,
  createMockUserStorageWithTriggers,
} from '../__fixtures__/mock-notification-user-storage';
import {
  mockBatchCreateTriggers,
  mockBatchDeleteTriggers,
  mockListNotifications,
  mockMarkNotificationsAsRead,
} from '../__fixtures__/mockServices';
import { TRIGGER_TYPES } from '../constants/notification-schema';
import type { UserStorage } from '../types/user-storage/user-storage';
import * as Utils from '../utils/utils';
import * as OnChainNotifications from './onchain-notifications';

const MOCK_STORAGE_KEY = 'MOCK_USER_STORAGE_KEY';
const MOCK_BEARER_TOKEN = 'MOCK_BEARER_TOKEN';
const MOCK_TRIGGER_ID = 'TRIGGER_ID_1';

describe('On Chain Notifications - createOnChainTriggers()', () => {
  const assertUserStorageTriggerStatus = (
    userStorage: UserStorage,
    enabled: boolean,
  ) => {
    expect(
      userStorage[MOCK_USER_STORAGE_ACCOUNT][MOCK_USER_STORAGE_CHAIN][
        MOCK_TRIGGER_ID
      ].e,
    ).toBe(enabled);
  };

  const arrangeMocks = () => {
    const mockUserStorage = createMockUserStorageWithTriggers([
      { id: MOCK_TRIGGER_ID, k: TRIGGER_TYPES.ETH_SENT, e: false },
    ]);
    const triggers = Utils.traverseUserStorageTriggers(mockUserStorage);
    const mockEndpoint = mockBatchCreateTriggers();

    return {
      mockUserStorage,
      triggers,
      mockEndpoint,
    };
  };

  it('should create new triggers', async () => {
    const mocks = arrangeMocks();

    // The initial trigger to create should not be enabled
    assertUserStorageTriggerStatus(mocks.mockUserStorage, false);

    await OnChainNotifications.createOnChainTriggers(
      mocks.mockUserStorage,
      MOCK_STORAGE_KEY,
      MOCK_BEARER_TOKEN,
      mocks.triggers,
    );

    expect(mocks.mockEndpoint.isDone()).toBe(true);

    // once we created triggers, we expect the trigger to be enabled
    assertUserStorageTriggerStatus(mocks.mockUserStorage, true);
  });

  it('does not call endpoint if there are no triggers to create', async () => {
    const mocks = arrangeMocks();
    await OnChainNotifications.createOnChainTriggers(
      mocks.mockUserStorage,
      MOCK_STORAGE_KEY,
      MOCK_BEARER_TOKEN,
      [], // there are no triggers we've provided that need to be created
    );

    expect(mocks.mockEndpoint.isDone()).toBe(false);
  });

  it('should throw error if endpoint fails', async () => {
    const mockUserStorage = createMockUserStorageWithTriggers([
      { id: MOCK_TRIGGER_ID, k: TRIGGER_TYPES.ETH_SENT, e: false },
    ]);
    const triggers = Utils.traverseUserStorageTriggers(mockUserStorage);
    const mockBadEndpoint = mockBatchCreateTriggers({
      status: 500,
      body: { error: 'mock api failure' },
    });

    // The initial trigger to create should not be enabled
    assertUserStorageTriggerStatus(mockUserStorage, false);

    await expect(
      OnChainNotifications.createOnChainTriggers(
        mockUserStorage,
        MOCK_STORAGE_KEY,
        MOCK_BEARER_TOKEN,
        triggers,
      ),
    ).rejects.toThrow(expect.any(Error));

    mockBadEndpoint.done();

    // since failed, expect triggers to not be enabled
    assertUserStorageTriggerStatus(mockUserStorage, false);
  });
});

describe('On Chain Notifications - deleteOnChainTriggers()', () => {
  const getTriggerFromUserStorage = (
    userStorage: UserStorage,
    triggerId: string,
  ) => {
    return userStorage[MOCK_USER_STORAGE_ACCOUNT][MOCK_USER_STORAGE_CHAIN][
      triggerId
    ];
  };

  const arrangeUserStorage = () => {
    const triggerId1 = 'TRIGGER_ID_1';
    const triggerId2 = 'TRIGGER_ID_2';
    const mockUserStorage = createMockUserStorageWithTriggers([
      triggerId1,
      triggerId2,
    ]);

    return {
      mockUserStorage,
      triggerId1,
      triggerId2,
    };
  };

  it('should delete a trigger from API and in user storage', async () => {
    const { mockUserStorage, triggerId1, triggerId2 } = arrangeUserStorage();
    const mockEndpoint = mockBatchDeleteTriggers();

    // Assert that triggers exists
    [triggerId1, triggerId2].forEach((t) => {
      expect(getTriggerFromUserStorage(mockUserStorage, t)).toBeDefined();
    });

    await OnChainNotifications.deleteOnChainTriggers(
      mockUserStorage,
      MOCK_STORAGE_KEY,
      MOCK_BEARER_TOKEN,
      [triggerId2],
    );

    mockEndpoint.done();

    // Assert trigger deletion
    expect(
      getTriggerFromUserStorage(mockUserStorage, triggerId1),
    ).toBeDefined();
    expect(
      getTriggerFromUserStorage(mockUserStorage, triggerId2),
    ).toBeUndefined();
  });

  it('should delete all triggers and account in user storage', async () => {
    const { mockUserStorage, triggerId1, triggerId2 } = arrangeUserStorage();
    const mockEndpoint = mockBatchDeleteTriggers();

    await OnChainNotifications.deleteOnChainTriggers(
      mockUserStorage,
      MOCK_STORAGE_KEY,
      MOCK_BEARER_TOKEN,
      [triggerId1, triggerId2], // delete all triggers for an account
    );

    mockEndpoint.done();

    // assert that the underlying user is also deleted since all underlying triggers are deleted
    expect(mockUserStorage[MOCK_USER_STORAGE_ACCOUNT]).toBeUndefined();
  });

  it('should throw error if endpoint fails to delete', async () => {
    const { mockUserStorage, triggerId1, triggerId2 } = arrangeUserStorage();
    const mockBadEndpoint = mockBatchDeleteTriggers({
      status: 500,
      body: { error: 'mock api failure' },
    });

    await expect(
      OnChainNotifications.deleteOnChainTriggers(
        mockUserStorage,
        MOCK_STORAGE_KEY,
        MOCK_BEARER_TOKEN,
        [triggerId1, triggerId2],
      ),
    ).rejects.toThrow(expect.any(Error));

    mockBadEndpoint.done();

    // Assert that triggers were not deleted from user storage
    [triggerId1, triggerId2].forEach((t) => {
      expect(getTriggerFromUserStorage(mockUserStorage, t)).toBeDefined();
    });
  });
});

describe('On Chain Notifications - getOnChainNotifications()', () => {
  it('should return a list of notifications', async () => {
    const mockEndpoint = mockListNotifications();
    const mockUserStorage = createMockUserStorageWithTriggers([
      'trigger_1',
      'trigger_2',
    ]);

    const result = await OnChainNotifications.getOnChainNotifications(
      mockUserStorage,
      MOCK_BEARER_TOKEN,
    );

    mockEndpoint.done();
    expect(result.length > 0).toBe(true);
  });

  it('should return an empty list if not triggers found in user storage', async () => {
    const mockEndpoint = mockListNotifications();
    const mockUserStorage = createMockUserStorageWithTriggers([]); // no triggers

    const result = await OnChainNotifications.getOnChainNotifications(
      mockUserStorage,
      MOCK_BEARER_TOKEN,
    );

    expect(mockEndpoint.isDone()).toBe(false);
    expect(result.length === 0).toBe(true);
  });

  it('should return an empty list of notifications if endpoint fails to fetch triggers', async () => {
    const mockEndpoint = mockListNotifications({
      status: 500,
      body: { error: 'mock api failure' },
    });
    const mockUserStorage = createMockUserStorageWithTriggers([
      'trigger_1',
      'trigger_2',
    ]);

    const result = await OnChainNotifications.getOnChainNotifications(
      mockUserStorage,
      MOCK_BEARER_TOKEN,
    );

    mockEndpoint.done();
    expect(result.length === 0).toBe(true);
  });
});

describe('On Chain Notifications - markNotificationsAsRead()', () => {
  it('should successfully call endpoint to mark notifications as read', async () => {
    const mockEndpoint = mockMarkNotificationsAsRead();
    await OnChainNotifications.markNotificationsAsRead(MOCK_BEARER_TOKEN, [
      'notification_1',
      'notification_2',
    ]);

    expect(mockEndpoint.isDone()).toBe(true);
  });

  it('should throw error if fails to call endpoint to mark notifications as read', async () => {
    const mockBadEndpoint = mockMarkNotificationsAsRead({
      status: 500,
      body: { error: 'mock api failure' },
    });
    await expect(
      OnChainNotifications.markNotificationsAsRead(MOCK_BEARER_TOKEN, [
        'notification_1',
        'notification_2',
      ]),
    ).rejects.toThrow(expect.any(Error));

    mockBadEndpoint.done();
  });
});
