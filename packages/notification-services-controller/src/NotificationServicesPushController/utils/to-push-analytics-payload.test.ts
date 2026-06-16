import type { PushAnalyticsPayload } from '../types';
import { toPushAnalyticsPayload } from './to-push-analytics-payload';

const mockFcmData = {
  notification_id: 'test-notification-id',
  notification_type: 'wallet_activity',
  notification_subtype: 'eth_received',
  chain_id: '1',
  deeplink: 'https://example.com/deeplink',
};

const expectedAnalyticsPayload: PushAnalyticsPayload = {
  notification_id: 'test-notification-id',
  notification_type: 'wallet_activity',
  notification_subtype: 'eth_received',
  chain_id: 1,
  deeplink: 'https://example.com/deeplink',
};

describe('toPushAnalyticsPayload() tests', () => {
  it('should build the analytics payload from FCM data', () => {
    expect(toPushAnalyticsPayload(mockFcmData)).toStrictEqual(
      expectedAnalyticsPayload,
    );
  });

  it('should default notification_subtype to an empty string when absent', () => {
    const { notification_subtype: _, ...dataWithoutSubtype } = mockFcmData;

    expect(toPushAnalyticsPayload(dataWithoutSubtype)).toStrictEqual({
      ...expectedAnalyticsPayload,
      notification_subtype: '',
    });
  });

  it.each([
    undefined,
    null,
    'not an object',
    { notification_id: 'test-id' },
    { notification_type: 'wallet_activity' },
  ] as const)(
    'should return null for invalid FCM data payload - %p',
    (data) => {
      expect(
        toPushAnalyticsPayload(
          data as unknown as Record<string, string> | undefined,
        ),
      ).toBeNull();
    },
  );
});
