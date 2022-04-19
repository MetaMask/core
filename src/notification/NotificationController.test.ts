import { ControllerMessenger } from '../ControllerMessenger';
import {
  ControllerActions,
  NotificationController,
  NotificationControllerMessenger,
  NotificationControllerStateChange,
  NotificationType,
} from './NotificationController';

const name = 'NotificationController';

/**
 * Constructs a unrestricted controller messenger.
 *
 * @returns A unrestricted controller messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<
    ControllerActions,
    NotificationControllerStateChange
  >();
}

/**
 * Constructs a restricted controller messenger.
 *
 * @param controllerMessenger - An optional unrestricted messenger
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger(
  controllerMessenger = getUnrestrictedMessenger(),
) {
  return controllerMessenger.getRestricted<
    typeof name,
    ControllerActions['type'],
    never
  >({
    name,
    allowedActions: ['NotificationController:show'],
  }) as NotificationControllerMessenger;
}

const origin = 'snap_test';
const message = 'foo';

describe('NotificationController', () => {
  it('action: NotificationController:show native notifications', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const showNativeNotification = jest.fn();
    new NotificationController({
      showNativeNotification,
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(1);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });

  it('action: NotificationController:show in-app notifications', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const showNativeNotification = jest.fn();
    const controller = new NotificationController({
      showNativeNotification,
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, {
        type: NotificationType.InApp,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(0);
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
  });

  it('action: NotificationController:markViewed', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const showNativeNotification = jest.fn();
    const controller = new NotificationController({
      showNativeNotification,
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, {
        type: NotificationType.InApp,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(0);
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    await unrestricted.call('NotificationController:markRead', [
      notifications[0].id,
    ]);

    const newNotifications = Object.values(controller.state.notifications);
    expect(newNotifications).toContainEqual({
      ...notifications[0],
      read: true,
    });

    expect(newNotifications).toHaveLength(1);
  });

  it('action: NotificationController:dismiss', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const showNativeNotification = jest.fn();
    const controller = new NotificationController({
      showNativeNotification,
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, {
        type: NotificationType.InApp,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(0);
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    await unrestricted.call('NotificationController:dismiss', [
      notifications[0].id,
    ]);

    expect(Object.values(controller.state.notifications)).toHaveLength(0);
  });

  it('uses showNativeNotification to show a notification', () => {
    const messenger = getRestrictedMessenger();

    const showNativeNotification = jest.fn();
    const controller = new NotificationController({
      showNativeNotification,
      messenger,
    });
    expect(
      controller.show(origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });
});
