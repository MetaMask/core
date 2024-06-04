import { createMockFeatureAnnouncementRaw } from '../../tests/mocks/mock-feature-announcements';
import { createMockNotificationEthSent } from '../../tests/mocks/mock-raw-notifications';
import type { TriggerType } from '../constants/notification-schema';
import { processNotification } from './process-notifications';

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

  it('throws on invalid notification to process', () => {
    const rawNotification = createMockNotificationEthSent();

    // Testing Mock with invalid notification type
    rawNotification.type = 'FAKE_NOTIFICATION_TYPE' as TriggerType.EthSent;

    expect(() => processNotification(rawNotification)).toThrow('No processor');
  });
});
