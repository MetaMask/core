import { ControllerMessenger } from '../ControllerMessenger';
import {
  NotificationControllerActions,
  NotificationController,
  NotificationControllerStateChange,
} from './NotificationController';

const name = 'NotificationController';

/**
 * Constructs a unrestricted controller messenger.
 *
 * @returns A unrestricted controller messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<
    NotificationControllerActions,
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
  return controllerMessenger.getRestricted<typeof name, never, never>({
    name,
  });
}

const origin = 'snap_test';
const message = 'foo';

describe('NotificationController', () => {
  it('action: NotificationController:show', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, message),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    expect(notifications).toContainEqual({
      createdDate: expect.any(Number),
      id: expect.any(String),
      message,
      origin,
      readDate: null,
    });
  });

  it('action: NotificationController:markViewed', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, message),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    expect(
      await unrestricted.call('NotificationController:markRead', [
        notifications[0].id,
        'foo',
      ]),
    ).toBeUndefined();

    const newNotifications = Object.values(controller.state.notifications);
    expect(newNotifications).toContainEqual({
      ...notifications[0],
      readDate: expect.any(Number),
    });

    expect(newNotifications).toHaveLength(1);
  });

  it('action: NotificationController:dismiss', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, message),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    expect(
      await unrestricted.call('NotificationController:dismiss', [
        notifications[0].id,
        'foo',
      ]),
    ).toBeUndefined();

    expect(Object.values(controller.state.notifications)).toHaveLength(0);
  });

  it('action: NotificationController:clear', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      await unrestricted.call('NotificationController:show', origin, message),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    expect(
      await unrestricted.call('NotificationController:clear'),
    ).toBeUndefined();

    expect(Object.values(controller.state.notifications)).toHaveLength(0);
  });
});
