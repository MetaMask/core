import { createMockFeatureAnnouncementRaw } from '../__fixtures__/mock-feature-announcements';
import { TRIGGER_TYPES } from '../constants/notification-schema';
import {
  isFeatureAnnouncementRead,
  processFeatureAnnouncement,
} from './process-feature-announcement';

describe('process-feature-announcement - isFeatureAnnouncementRead()', () => {
  const MOCK_NOTIFICATION_ID = 'MOCK_NOTIFICATION_ID';

  it('returns true if a given notificationId is within list of read platform notifications', () => {
    const notification = {
      id: MOCK_NOTIFICATION_ID,
      createdAt: new Date().toString(),
    };

    const result1 = isFeatureAnnouncementRead(notification, [
      'id-1',
      'id-2',
      MOCK_NOTIFICATION_ID,
    ]);
    expect(result1).toBe(true);

    const result2 = isFeatureAnnouncementRead(notification, ['id-1', 'id-2']);
    expect(result2).toBe(false);
  });

  it('returns isRead if notification is older than 90 days', () => {
    const mockDate = new Date();
    mockDate.setDate(mockDate.getDate() - 100);

    const notification = {
      id: MOCK_NOTIFICATION_ID,
      createdAt: mockDate.toString(),
    };

    const result = isFeatureAnnouncementRead(notification, []);
    expect(result).toBe(true);
  });
});

describe('process-feature-announcement - processFeatureAnnouncement()', () => {
  it('processes a Raw Feature Announcement to a shared Notification Type', () => {
    const rawNotification = createMockFeatureAnnouncementRaw();
    const result = processFeatureAnnouncement(rawNotification);

    expect(result.id).toBe(rawNotification.data.id);
    expect(result.type).toBe(TRIGGER_TYPES.FEATURES_ANNOUNCEMENT);
    expect(result.isRead).toBe(false);
    expect(result.data).toBeDefined();
  });
});
