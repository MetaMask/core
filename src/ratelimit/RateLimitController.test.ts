import { ControllerMessenger } from '../ControllerMessenger';
import {
  ControllerActions,
  RateLimitStateChange,
  RateLimitController,
  RateLimitMessenger,
  GetRateLimitState,
  CallAPI,
} from './RateLimitController';

const name = 'RateLimitController';

enum ApiType {
  showNativeNotification = 'showNativeNotification',
}

/**
 * Constructs a unrestricted controller messenger.
 *
 * @returns A unrestricted controller messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<
    GetRateLimitState<ApiType> | CallAPI<ApiType>,
    RateLimitStateChange<ApiType>
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
    ControllerActions<ApiType>['type'],
    never
  >({
    name,
    allowedActions: ['RateLimitController:call'],
  }) as RateLimitMessenger<ApiType>;
}

const origin = 'snap_test';
const message = 'foo';

describe('RateLimitController', () => {
  jest.useFakeTimers();

  it('action: RateLimitController:call', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
    });
    const showSpy = jest
      .spyOn(controller, 'call')
      .mockImplementationOnce(() => true);
    expect(
      await unrestricted.call('RateLimitController:call', origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toBe(true);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  it('uses showNativeNotification to show a notification', () => {
    const messenger = getRestrictedMessenger();

    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
    });
    expect(
      controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toBe(true);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });

  it('returns false if rate-limited', () => {
    const messenger = getRestrictedMessenger();
    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
      rateLimitCount: 1,
    });

    expect(
      controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toBe(true);

    expect(
      controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toBe(false);
    expect(showNativeNotification).toHaveBeenCalledTimes(1);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });

  it('rate limit is reset after timeout', () => {
    const messenger = getRestrictedMessenger();
    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
      rateLimitCount: 1,
    });
    expect(
      controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toBe(true);
    jest.runAllTimers();
    expect(
      controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toBe(true);
    expect(showNativeNotification).toHaveBeenCalledTimes(2);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });
});
