import { ControllerMessenger } from '../ControllerMessenger';
import { GetSubjectMetadataState } from '../subject-metadata';
import {
  ControllerActions,
  DismissNotification,
  GetNotificationCount,
  GetNotifications,
  GetNotificationState,
  NotificationController,
  NotificationMessenger,
  NotificationStateChange,
  NotificationType,
  ShowNotification,
} from './NotificationControllerV2';

const name = 'NotificationControllerV2';

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
    | GetNotificationCount
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
      'NotificationControllerV2:show',
    ],
  }) as NotificationMessenger;
}

const SNAP_NAME = 'Test Snap Name';
const origin = 'snap_test';
const message = 'foo';

const subjectMetadata = {
  snap_test: { origin: 'snap_test', name: SNAP_NAME },
};

describe('NotificationControllerV2', () => {
  it('action: NotificationControllerV2:show native notifications', async () => {
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
      await unrestricted.call('NotificationControllerV2:show', origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
  });

  it('action: NotificationControllerV2:show in-app notifications', async () => {
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
      await unrestricted.call('NotificationControllerV2:show', origin, {
        type: NotificationType.InApp,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(0);
    const count = await unrestricted.call('NotificationControllerV2:getCount');
    expect(count).toBe(1);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
  });

  it('action: NotificationControllerV2:getNotifications', async () => {
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
      await unrestricted.call('NotificationControllerV2:show', origin, {
        type: NotificationType.InApp,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(0);
    const notifications = await unrestricted.call(
      'NotificationControllerV2:getNotifications',
    );
    expect(notifications).toHaveLength(1);
    expect(notifications).toContainEqual({
      id: expect.any(String),
      message,
      title: SNAP_NAME,
      type: NotificationType.InApp,
    });
    expect(callActionSpy).toHaveBeenCalledTimes(1);
  });

  it('action: NotificationControllerV2:dismiss', async () => {
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
      await unrestricted.call('NotificationControllerV2:show', origin, {
        type: NotificationType.InApp,
        message,
      }),
    ).toBeUndefined();
    expect(showNativeNotification).toHaveBeenCalledTimes(0);
    expect(await unrestricted.call('NotificationControllerV2:getCount')).toBe(
      1,
    );
    expect(callActionSpy).toHaveBeenCalledTimes(1);
    const notifications = await unrestricted.call(
      'NotificationControllerV2:getNotifications',
    );
    await unrestricted.call(
      'NotificationControllerV2:dismiss',
      notifications[0].id,
    );

    expect(await unrestricted.call('NotificationControllerV2:getCount')).toBe(
      0,
    );
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
