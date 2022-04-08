import { ControllerMessenger } from '../ControllerMessenger';
import { GetSubjectMetadataState } from '../subject-metadata';
import {
  ControllerActions,
  DismissNotification,
  GetNotificationCount,
  GetNotifications,
  GetNotificationState,
  GetUnreadNotificationCount,
  MarkNotificationRead,
  NotificationController,
  NotificationMessenger,
  NotificationStateChange,
  NotificationType,
  ShowNotification,
} from './NotificationController';

const name = 'NotificationController';

/**
 * Constructs a unrestricted controller messenger.
 *
 * @returns A unrestricted controller messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<
    | GetNotificationState
    | ShowNotification
    | DismissNotification
    | MarkNotificationRead
    | GetNotificationCount
    | GetUnreadNotificationCount
    | GetNotifications
    | GetSubjectMetadataState,
    NotificationStateChange
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
    ControllerActions['type'] | GetSubjectMetadataState['type'],
    never
  >({
    name,
    allowedActions: [
      'SubjectMetadataController:getState',
      'NotificationController:show',
    ],
  }) as NotificationMessenger;
}

const SNAP_NAME = 'Test Snap Name';
const origin = 'snap_test';
const message = 'foo';

const subjectMetadata = {
  snap_test: { origin: 'snap_test', name: SNAP_NAME },
};

describe('NotificationController', () => {
  it('action: NotificationController:show native notifications', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementationOnce((..._args: any) => ({
        subjectMetadata,
      }));

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
    expect(callActionSpy).toHaveBeenCalledTimes(1);
  });

  it('action: NotificationController:show in-app notifications', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementationOnce((..._args: any) => ({
        subjectMetadata,
      }));

    const showNativeNotification = jest.fn();
    new NotificationController({
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
    const count = await unrestricted.call('NotificationController:getCount');
    expect(count).toBe(1);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
  });

  it('action: NotificationController:getNotifications', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementationOnce((..._args: any) => ({
        subjectMetadata,
      }));

    const showNativeNotification = jest.fn();
    new NotificationController({
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
    const notifications = await unrestricted.call(
      'NotificationController:getNotifications',
    );
    expect(notifications).toHaveLength(1);
    expect(notifications).toContainEqual({
      id: expect.any(String),
      date: expect.any(Number),
      origin,
      read: false,
      message,
      title: SNAP_NAME,
      type: NotificationType.InApp,
    });
    expect(callActionSpy).toHaveBeenCalledTimes(1);
  });

  it('action: NotificationController:markViewed', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementationOnce((..._args: any) => ({
        subjectMetadata,
      }));

    const showNativeNotification = jest.fn();
    new NotificationController({
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
    expect(await unrestricted.call('NotificationController:getCount')).toBe(1);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
    const notifications = await unrestricted.call(
      'NotificationController:getNotifications',
    );
    await unrestricted.call(
      'NotificationController:markRead',
      notifications[0].id,
    );

    expect(
      await unrestricted.call('NotificationController:getNotifications'),
    ).toContainEqual({ ...notifications[0], read: true });

    expect(await unrestricted.call('NotificationController:getCount')).toBe(1);

    expect(
      await unrestricted.call('NotificationController:getUnreadCount'),
    ).toBe(0);
  });

  it('action: NotificationController:dismiss', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementationOnce((..._args: any) => ({
        subjectMetadata,
      }));

    const showNativeNotification = jest.fn();
    new NotificationController({
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
    expect(await unrestricted.call('NotificationController:getCount')).toBe(1);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
    const notifications = await unrestricted.call(
      'NotificationController:getNotifications',
    );
    await unrestricted.call(
      'NotificationController:dismiss',
      notifications[0].id,
    );

    expect(await unrestricted.call('NotificationController:getCount')).toBe(0);
  });

  it('uses showNativeNotification to show a notification', () => {
    const messenger = getRestrictedMessenger();
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementationOnce((..._args: any) => ({
        subjectMetadata,
      }));

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
    expect(showNativeNotification).toHaveBeenCalledWith(SNAP_NAME, message);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith(
      'SubjectMetadataController:getState',
    );
  });

  it('falls back to origin if no metadata present', () => {
    const messenger = getRestrictedMessenger();
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementationOnce((..._args: any) => ({
        subjectMetadata: {},
      }));

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
    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith(
      'SubjectMetadataController:getState',
    );
  });
});
