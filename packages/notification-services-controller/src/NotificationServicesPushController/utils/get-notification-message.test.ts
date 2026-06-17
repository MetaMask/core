import { Processors } from '../../NotificationServicesController/index.js';
import {
  createMockNotificationEthReceived,
  createMockNotificationEthSent,
  createMockPlatformNotification,
} from '../../NotificationServicesController/mocks/index.js';
import { createOnChainPushNotificationMessage } from './get-notification-message.js';

const { processNotification } = Processors;

describe('createOnChainPushNotificationMessage', () => {
  it('returns null for on-chain notifications (V4 on-chain has no template)', () => {
    const notification = processNotification(createMockNotificationEthSent());
    const result = createOnChainPushNotificationMessage(notification);
    expect(result).toBeNull();
  });

  it('returns null for other on-chain notification types', () => {
    const notification = processNotification(
      createMockNotificationEthReceived(),
    );
    const result = createOnChainPushNotificationMessage(notification);
    expect(result).toBeNull();
  });

  it('reads title and body from the template for platform notifications', () => {
    const notification = processNotification(createMockPlatformNotification());
    const result = createOnChainPushNotificationMessage(notification);

    expect(result).not.toBeNull();
    expect(result?.title).toBe('This is a Platform Notification!');
    expect(result?.description).toContain('Teams can now build out');
  });

  it('populates ctaLink from the template cta link for platform notifications', () => {
    const notification = processNotification(createMockPlatformNotification());
    const result = createOnChainPushNotificationMessage(notification);

    expect(result?.ctaLink).toBe('https://metamask.io/get-started');
  });
});
