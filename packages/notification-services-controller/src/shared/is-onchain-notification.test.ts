import { isOnChainRawNotification } from '.';
import {
  createMockFeatureAnnouncementRaw,
  createMockNotificationEthSent,
} from '../NotificationServicesController/__fixtures__';

describe('is-onchain-notification - isOnChainRawNotification()', () => {
  it('returns true if OnChainRawNotification', () => {
    const notification = createMockNotificationEthSent();
    const result = isOnChainRawNotification(notification);
    expect(result).toBe(true);
  });
  it('returns false if not OnChainRawNotification', () => {
    const notification = createMockFeatureAnnouncementRaw();
    const result = isOnChainRawNotification(notification);
    expect(result).toBe(false);
  });
});
