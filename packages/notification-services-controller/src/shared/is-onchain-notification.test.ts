import { isOnChainRawNotification } from '.';
import {
  createMockFeatureAnnouncementRaw,
  createMockPlatformNotification,
  createMockNotificationEthSent,
} from '../NotificationServicesController/mocks';

describe('is-onchain-notification - isOnChainRawNotification()', () => {
  it('returns true if OnChainRawNotification', () => {
    const notification = createMockNotificationEthSent();
    const result = isOnChainRawNotification(notification);
    expect(result).toBe(true);
  });
  it('returns false if not OnChainRawNotification', () => {
    const testNotifications = [
      createMockFeatureAnnouncementRaw(),
      createMockPlatformNotification(),
    ];
    testNotifications.forEach((notification) => {
      const result = isOnChainRawNotification(notification);
      expect(result).toBe(false);
    });
  });
});
