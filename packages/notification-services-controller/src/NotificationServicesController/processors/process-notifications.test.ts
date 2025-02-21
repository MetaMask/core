import {
  processNotification,
  safeProcessNotification,
} from './process-notifications';
import { createMockFeatureAnnouncementRaw } from '../mocks/mock-feature-announcements';
import { createMockNotificationEthSent } from '../mocks/mock-raw-notifications';
import { createMockSnapNotification } from '../mocks/mock-snap-notification';
import type { TRIGGER_TYPES } from '../constants/notification-schema';

describe('process-notifications - processNotification()', () => {
  // More thorough tests are found in the specific process
  it('maps Feature Announcement to shared Notification Type', () => {
    const result = processNotification(createMockFeatureAnnouncementRaw());
    expect(result).toBeDefined();
  });

  // More thorough tests are found in the specific process
  it('maps On Chain Notification to shared Notification Type', () => {
    const result = processNotification(createMockNotificationEthSent());
    expect(result).toBeDefined();
  });

  // More thorough tests are found in the specific process
  it('maps Snap Notification to shared Notification Type', () => {
    const result = processNotification(createMockSnapNotification());
    expect(result).toBeDefined();
  });

  it('throws on invalid notification to process', () => {
    const rawNotification = createMockNotificationEthSent();

    // Testing Mock with invalid notification type
    rawNotification.type = 'FAKE_NOTIFICATION_TYPE' as TRIGGER_TYPES.ETH_SENT;

    expect(() => processNotification(rawNotification)).toThrow(
      expect.any(Error),
    );
  });
});

describe('process-notifications - safeProcessNotification()', () => {
  // More thorough tests are found in the specific process
  it('maps On Chain Notification to shared Notification Type', () => {
    const result = safeProcessNotification(createMockNotificationEthSent());
    expect(result).toBeDefined();
  });

  it('returns undefined for a notification unable to process', () => {
    const rawNotification = createMockNotificationEthSent();

    // Testing Mock with invalid notification type
    rawNotification.type = 'FAKE_NOTIFICATION_TYPE' as TRIGGER_TYPES.ETH_SENT;
    const result = safeProcessNotification(rawNotification);
    expect(result).toBeUndefined();
  });
});
