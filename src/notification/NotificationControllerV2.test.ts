import { ControllerMessenger } from '../ControllerMessenger';
import {
  GetNotificationState,
  NotificationController,
  NotificationStateChange,
  NotificationType,
} from './NotificationControllerV2';

const name = 'NotificationControllerV2';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    GetNotificationState,
    NotificationStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    typeof name,
    never,
    never
  >({
    name,
  });
  return messenger;
}

describe('NotificationControllerV2', () => {
  jest.useFakeTimers();
  it('uses platform to show a notification', () => {
    const messenger = getRestrictedMessenger();
    const platform = { _showNotifiction: jest.fn() };
    const controller = new NotificationController({ platform, messenger });
    const origin = 'snap_test';
    const message = 'foo';
    const result = controller.show(origin, {
      type: NotificationType.Native,
      message,
    });
    expect(result).toBe(true);
    expect(platform._showNotifiction).toHaveBeenCalledWith(origin, message);
  });

  it('returns false if rate-limited', () => {
    const messenger = getRestrictedMessenger();
    const platform = { _showNotifiction: jest.fn() };
    const controller = new NotificationController({
      platform,
      messenger,
      rateLimitCount: 1,
    });
    const origin = 'snap_test';
    const message = 'foo';
    const result = controller.show(origin, {
      type: NotificationType.Native,
      message,
    });
    const result2 = controller.show(origin, {
      type: NotificationType.Native,
      message,
    });
    expect(result).toBe(true);
    expect(result2).toBe(false);
    expect(platform._showNotifiction).toHaveBeenCalledTimes(1);
    expect(platform._showNotifiction).toHaveBeenCalledWith(origin, message);
  });

  it('rate limit is reset after timeout', () => {
    const messenger = getRestrictedMessenger();
    const platform = { _showNotifiction: jest.fn() };
    const controller = new NotificationController({
      platform,
      messenger,
      rateLimitCount: 1,
    });
    const origin = 'snap_test';
    const message = 'foo';
    const result = controller.show(origin, {
      type: NotificationType.Native,
      message,
    });
    expect(result).toBe(true);
    jest.runAllTimers();
    const result2 = controller.show(origin, {
      type: NotificationType.Native,
      message,
    });
    expect(result2).toBe(true);
    expect(platform._showNotifiction).toHaveBeenCalledTimes(2);
    expect(platform._showNotifiction).toHaveBeenCalledWith(origin, message);
  });
});
