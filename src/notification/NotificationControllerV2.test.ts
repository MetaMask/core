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
    // @ts-expect-error Missing types for now
    allowedActions: [
      'SubjectMetadataController:getState',
      'NotificationControllerV2:show',
    ],
  });
  return messenger;
}

const SNAP_NAME = 'Test Snap Name';
const origin = 'snap_test';
const message = 'foo';

const subjectMetadata = {
  snap_test: { origin: 'snap_test', name: SNAP_NAME },
};

describe('NotificationControllerV2', () => {
  jest.useFakeTimers();

  it('action: NotificationControllerV2:show', async () => {
    const messenger = getRestrictedMessenger();

    const showNativeNotification = jest.fn();
    const controller = new NotificationController({
      showNativeNotification,
      messenger,
    });
    const showSpy = jest
      .spyOn(controller, 'show')
      .mockImplementationOnce(() => true);
    expect(
      await messenger.call('NotificationControllerV2:show', origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBe(true);
    expect(showSpy).toHaveBeenCalledTimes(1);
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
    ).toBe(true);
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
    ).toBe(true);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith(
      'SubjectMetadataController:getState',
    );
  });

  it('returns false if rate-limited', () => {
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
      rateLimitCount: 1,
    });

    expect(
      controller.show(origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBe(true);

    expect(
      controller.show(origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBe(false);
    expect(showNativeNotification).toHaveBeenCalledTimes(1);
    expect(showNativeNotification).toHaveBeenCalledWith(SNAP_NAME, message);
    expect(callActionSpy).toHaveBeenCalledTimes(1);
    expect(callActionSpy).toHaveBeenCalledWith(
      'SubjectMetadataController:getState',
    );
  });

  it('rate limit is reset after timeout', () => {
    const messenger = getRestrictedMessenger();
    const callActionSpy = jest
      .spyOn(messenger, 'call')
      .mockImplementation((..._args: any) => ({
        subjectMetadata,
      }));
    const showNativeNotification = jest.fn();
    const controller = new NotificationController({
      showNativeNotification,
      messenger,
      rateLimitCount: 1,
    });
    expect(
      controller.show(origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBe(true);
    jest.runAllTimers();
    expect(
      controller.show(origin, {
        type: NotificationType.Native,
        message,
      }),
    ).toBe(true);
    expect(showNativeNotification).toHaveBeenCalledTimes(2);
    expect(showNativeNotification).toHaveBeenCalledWith(SNAP_NAME, message);
    expect(callActionSpy).toHaveBeenCalledTimes(2);
    expect(callActionSpy).toHaveBeenCalledWith(
      'SubjectMetadataController:getState',
    );
  });
});
