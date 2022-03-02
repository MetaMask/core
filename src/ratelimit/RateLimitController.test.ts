import { ControllerMessenger } from '../ControllerMessenger';
import {
  ControllerActions,
  RateLimitStateChange,
  RateLimitController,
  RateLimitMessenger,
  GetRateLimitState,
  CallApi,
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
    GetRateLimitState<ApiType> | CallApi<ApiType>,
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
const successResult = { isRateLimited: false, result: undefined };

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
      .mockImplementationOnce(() => Promise.resolve(successResult));
    expect(
      await unrestricted.call('RateLimitController:call', origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toStrictEqual(successResult);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  it('uses showNativeNotification to show a notification', async () => {
    const messenger = getRestrictedMessenger();

    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
    });
    expect(
      await controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toStrictEqual(successResult);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });

  it('returns false if rate-limited', async () => {
    const messenger = getRestrictedMessenger();
    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
      rateLimitCount: 1,
    });

    expect(
      await controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toStrictEqual(successResult);

    expect(
      await controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toStrictEqual({ isRateLimited: true });
    expect(showNativeNotification).toHaveBeenCalledTimes(1);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });

  it('rate limit is reset after timeout', async () => {
    const messenger = getRestrictedMessenger();
    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
      rateLimitCount: 1,
    });
    expect(
      await controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toStrictEqual(successResult);
    jest.runAllTimers();
    expect(
      await controller.call(origin, {
        type: ApiType.showNativeNotification,
        args: [origin, message],
      }),
    ).toStrictEqual(successResult);
    expect(showNativeNotification).toHaveBeenCalledTimes(2);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });
});
