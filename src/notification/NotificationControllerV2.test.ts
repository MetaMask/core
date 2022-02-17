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
    allowedActions: ['SubjectMetadataController:getState'],
  });
  return messenger;
}

const SNAP_NAME = 'Test Snap Name'

const subjectMetadata = {
  snap_test: { origin: 'snap_test', name: SNAP_NAME },
};

describe('NotificationControllerV2', () => {
  jest.useFakeTimers();
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
    const origin = 'snap_test';
    const message = 'foo';
    const result = controller.show(origin, {
      type: NotificationType.Native,
      message,
    });
    expect(result).toBe(true);
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
    const origin = 'snap_test';
    const message = 'foo';
    const result = controller.show(origin, {
      type: NotificationType.Native,
      message,
    });
    expect(result).toBe(true);
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
    expect(showNativeNotification).toHaveBeenCalledTimes(2);
    expect(showNativeNotification).toHaveBeenCalledWith(SNAP_NAME, message);
    expect(callActionSpy).toHaveBeenCalledTimes(2);
    expect(callActionSpy).toHaveBeenCalledWith(
      'SubjectMetadataController:getState',
    );
  });
});
