import * as OnChainNotifications from './api-notifications';
import {
  mockGetOnChainNotificationsConfig,
  mockUpdateOnChainNotifications,
  mockGetAPINotifications,
  mockMarkNotificationsAsRead,
} from '../__fixtures__/mockServices';
import {
  createMockNotificationERC20Sent,
  createMockPlatformNotification,
} from '../mocks';

const MOCK_BEARER_TOKEN = 'MOCK_BEARER_TOKEN';
const MOCK_ADDRESSES = ['0x123', '0x456', '0x789'];

describe('On Chain Notifications - getAPINotificationsConfig()', () => {
  it('should return notification config for addresses', async () => {
    const mockEndpoint = mockGetOnChainNotificationsConfig({
      status: 200,
      body: [{ address: '0xTestAddress', enabled: true }],
    });

    const result = await OnChainNotifications.getNotificationsApiConfigCached(
      MOCK_BEARER_TOKEN,
      MOCK_ADDRESSES,
    );

    expect(mockEndpoint.isDone()).toBe(true);
    expect(result).toStrictEqual([{ address: '0xTestAddress', enabled: true }]);
  });

  it('should bail early if given a list of empty addresses', async () => {
    const mockEndpoint = mockGetOnChainNotificationsConfig();

    const result = await OnChainNotifications.getNotificationsApiConfigCached(
      MOCK_BEARER_TOKEN,
      [],
    );

    expect(mockEndpoint.isDone()).toBe(false); // bailed early before API was called
    expect(result).toStrictEqual([]);
  });

  it('should return [] if endpoint fails', async () => {
    const mockBadEndpoint = mockGetOnChainNotificationsConfig({
      status: 500,
      body: { error: 'mock api failure' },
    });

    const result = await OnChainNotifications.getNotificationsApiConfigCached(
      MOCK_BEARER_TOKEN,
      MOCK_ADDRESSES,
    );

    expect(mockBadEndpoint.isDone()).toBe(true);
    expect(result).toStrictEqual([]);
  });
});

describe('On Chain Notifications - updateOnChainNotifications()', () => {
  const mockAddressesWithStatus = [
    { address: '0x123', enabled: true },
    { address: '0x456', enabled: false },
    { address: '0x789', enabled: true },
  ];

  it('should successfully update notification settings', async () => {
    const mockEndpoint = mockUpdateOnChainNotifications();

    await OnChainNotifications.updateOnChainNotifications(
      MOCK_BEARER_TOKEN,
      mockAddressesWithStatus,
    );

    expect(mockEndpoint.isDone()).toBe(true);
  });

  it('should bail early if given empty list of addresses', async () => {
    const mockEndpoint = mockUpdateOnChainNotifications();

    await OnChainNotifications.updateOnChainNotifications(
      MOCK_BEARER_TOKEN,
      [],
    );

    expect(mockEndpoint.isDone()).toBe(false); // bailed before API was called
  });

  it('should handle endpoint failure gracefully', async () => {
    const mockBadEndpoint = mockUpdateOnChainNotifications({
      status: 500,
      body: { error: 'mock api failure' },
    });

    // Should not throw error, should handle gracefully
    await OnChainNotifications.updateOnChainNotifications(
      MOCK_BEARER_TOKEN,
      mockAddressesWithStatus,
    );

    expect(mockBadEndpoint.isDone()).toBe(true);
  });

  it('should send addresses with enabled status in request body', async () => {
    const mockEndpoint = mockUpdateOnChainNotifications();

    await OnChainNotifications.updateOnChainNotifications(
      MOCK_BEARER_TOKEN,
      mockAddressesWithStatus,
    );

    expect(mockEndpoint.isDone()).toBe(true);
  });
});

describe('On Chain Notifications - getAPINotifications()', () => {
  it('should return a list of notifications', async () => {
    const mockEndpoint = mockGetAPINotifications();

    const result = await OnChainNotifications.getAPINotifications(
      MOCK_BEARER_TOKEN,
      MOCK_ADDRESSES,
      'en',
      'extension',
    );

    expect(mockEndpoint.isDone()).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should bail early when a list of empty addresses is provided', async () => {
    const mockEndpoint = mockGetAPINotifications();
    const result = await OnChainNotifications.getAPINotifications(
      MOCK_BEARER_TOKEN,
      [],
      'en',
      'extension',
    );

    expect(mockEndpoint.isDone()).toBe(false); // API was not called
    expect(result).toHaveLength(0);
  });

  it('should return an empty array if endpoint fails', async () => {
    const mockBadEndpoint = mockGetAPINotifications({
      status: 500,
      body: { error: 'mock api failure' },
    });

    const result = await OnChainNotifications.getAPINotifications(
      MOCK_BEARER_TOKEN,
      MOCK_ADDRESSES,
      'en',
      'extension',
    );

    expect(mockBadEndpoint.isDone()).toBe(true);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('should send correct request body format with addresses', async () => {
    const mockEndpoint = mockGetAPINotifications();

    const result = await OnChainNotifications.getAPINotifications(
      MOCK_BEARER_TOKEN,
      MOCK_ADDRESSES,
      'en',
      'extension',
    );

    expect(mockEndpoint.isDone()).toBe(true);
    expect(result.length > 0).toBe(true);
  });

  it('should filter out notifications invalid notifications', async () => {
    const mockEndpoint = mockGetAPINotifications({
      status: 200,
      body: [
        createMockNotificationERC20Sent(),
        {
          id: '2',
          data: {}, // missing kind
        },
        createMockPlatformNotification(),
      ],
    });

    const result = await OnChainNotifications.getAPINotifications(
      MOCK_BEARER_TOKEN,
      MOCK_ADDRESSES,
      'en',
      'extension',
    );

    expect(mockEndpoint.isDone()).toBe(true);
    expect(result).toHaveLength(2); // Should filter out the invalid notification
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

  it('should bail early if no notification IDs provided', async () => {
    const mockEndpoint = mockMarkNotificationsAsRead();

    await OnChainNotifications.markNotificationsAsRead(MOCK_BEARER_TOKEN, []);

    // Should not call the endpoint when no IDs provided
    expect(mockEndpoint.isDone()).toBe(false);
  });
});
