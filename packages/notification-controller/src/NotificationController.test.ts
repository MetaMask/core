import { ControllerMessenger } from '@metamask/base-controller';

import type {
  NotificationControllerActions,
  NotificationControllerStateChange,
} from './NotificationController';
import { NotificationController } from './NotificationController';

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
  return controllerMessenger.getRestricted({
    name,
    allowedActions: [],
    allowedEvents: [],
  });
}

const origin = 'snap_test';
const message = 'foo';

describe('NotificationController', () => {
  it('action: NotificationController:show', () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      unrestricted.call('NotificationController:show', origin, {
        message,
      }),
    ).toBeUndefined();

    expect(
      unrestricted.call('NotificationController:show', origin, {
        message,
        title: 'title',
        interfaceId: '1',
      }),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toStrictEqual({
      createdDate: expect.any(Number),
      id: expect.any(String),
      message,
      origin,
      readDate: null,
      expandedView: null,
    });
    expect(notifications[1]).toStrictEqual({
      createdDate: expect.any(Number),
      id: expect.any(String),
      message,
      origin,
      readDate: null,
      expandedView: { title: 'title', interfaceId: '1' },
    });
  });

  it('action: NotificationController:markViewed', () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      unrestricted.call('NotificationController:show', origin, {
        message,
      }),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    expect(
      unrestricted.call('NotificationController:markRead', [
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

  it('action: NotificationController:dismiss', () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      unrestricted.call('NotificationController:show', origin, {
        message,
      }),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    expect(
      unrestricted.call('NotificationController:dismiss', [
        notifications[0].id,
        'foo',
      ]),
    ).toBeUndefined();

    expect(Object.values(controller.state.notifications)).toHaveLength(0);
  });

  it('action: NotificationController:clear', () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new NotificationController({
      messenger,
    });

    expect(
      unrestricted.call('NotificationController:show', origin, {
        message,
      }),
    ).toBeUndefined();
    const notifications = Object.values(controller.state.notifications);
    expect(notifications).toHaveLength(1);
    expect(unrestricted.call('NotificationController:clear')).toBeUndefined();

    expect(Object.values(controller.state.notifications)).toHaveLength(0);
  });
});
