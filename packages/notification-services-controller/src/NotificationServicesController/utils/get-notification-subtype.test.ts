import { TRIGGER_TYPES } from '../constants/notification-schema';
import { createMockFeatureAnnouncementRaw } from '../mocks/mock-feature-announcements';
import {
  createMockNotificationEthReceived,
  createMockPlatformNotification,
} from '../mocks/mock-raw-notifications';
import { createMockSnapNotification } from '../mocks/mock-snap-notification';
import { processNotification } from '../processors/process-notifications';
import { getNotificationSubtype } from './get-notification-subtype';

describe('getNotificationSubtype', () => {
  it('returns the trigger kind for on-chain notifications', () => {
    const notification = processNotification(
      createMockNotificationEthReceived(),
    );
    expect(getNotificationSubtype(notification)).toBe(
      TRIGGER_TYPES.ETH_RECEIVED,
    );
  });

  it('returns the server-set notification_subtype for platform notifications', () => {
    const notification = processNotification(createMockPlatformNotification());
    expect(getNotificationSubtype(notification)).toBe('position_liquidated');
  });

  it('returns the snap subtype for snap notifications', () => {
    const notification = processNotification(createMockSnapNotification());
    expect(getNotificationSubtype(notification)).toBe(TRIGGER_TYPES.SNAP);
  });

  it('returns a stable label for feature-announcement notifications', () => {
    const notification = processNotification(
      createMockFeatureAnnouncementRaw(),
    );
    expect(getNotificationSubtype(notification)).toBe(
      TRIGGER_TYPES.FEATURES_ANNOUNCEMENT,
    );
  });
});
