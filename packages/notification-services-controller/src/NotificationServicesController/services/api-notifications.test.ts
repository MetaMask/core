import {
  mockGetAPINotifications,
  mockMarkNotificationsAsRead,
  mockQueryNotifications,
} from '../__fixtures__/mockServices';
import {
  createMockNotificationERC20Sent,
  createMockPlatformNotification,
} from '../mocks';
import * as OnChainNotifications from './api-notifications';
import { notificationsConfigCache } from './notification-config-cache';

const MOCK_BEARER_TOKEN = 'MOCK_BEARER_TOKEN';
const MOCK_ADDRESSES = ['0x123', '0x456', '0x789'];

describe('On Chain Notifications - getNotificationsApiConfigCached()', () => {
  afterEach(() => {
    notificationsConfigCache.clear();
  });

  it('should return notification config for addresses', async () => {
    const body = [
      { address: '0x123', enabled: true },
      { address: '0x456', enabled: false },
    ];
    const mockEndpoint = mockQueryNotifications({ status: 200, body });

    const result = await OnChainNotifications.getNotificationsApiConfigCached(
      MOCK_BEARER_TOKEN,
      ['0x123', '0x456'],
    );

    expect(mockEndpoint.isDone()).toBe(true);
    expect(result).toStrictEqual(body);
  });

  it('should bail early when no addresses are provided', async () => {
    const mockEndpoint = mockQueryNotifications();

    const result = await OnChainNotifications.getNotificationsApiConfigCached(
      MOCK_BEARER_TOKEN,
      [],
    );

    expect(mockEndpoint.isDone()).toBe(false);
    expect(result).toStrictEqual([]);
  });

  it('should cache returned notification config', async () => {
    const mockEndpoint = mockQueryNotifications({
      status: 200,
      body: [{ address: '0x123', enabled: true }],
    });

    await expect(
      OnChainNotifications.getNotificationsApiConfigCached(MOCK_BEARER_TOKEN, [
        '0x123',
      ]),
    ).resolves.toStrictEqual([{ address: '0x123', enabled: true }]);
    await expect(
      OnChainNotifications.getNotificationsApiConfigCached(MOCK_BEARER_TOKEN, [
        '0x123',
      ]),
    ).resolves.toStrictEqual([{ address: '0x123', enabled: true }]);

    expect(mockEndpoint.isDone()).toBe(true);
  });

  it('should return an empty array if the Trigger API fails', async () => {
    const mockEndpoint = mockQueryNotifications({
      status: 500,
      body: { error: 'mock api failure' },
    });

    const result = await OnChainNotifications.getNotificationsApiConfigCached(
      MOCK_BEARER_TOKEN,
      MOCK_ADDRESSES,
    );

    expect(mockEndpoint.isDone()).toBe(true);
    expect(result).toStrictEqual([]);
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
