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

const implementations = { showNativeNotification: jest.fn() };

type RateLimitedApis = typeof implementations;

/**
 * Constructs a unrestricted controller messenger.
 *
 * @returns A unrestricted controller messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<
    GetRateLimitState<RateLimitedApis> | CallApi<RateLimitedApis>,
    RateLimitStateChange<RateLimitedApis>
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
    ControllerActions<RateLimitedApis>['type'],
    never
  >({
    name,
    allowedActions: ['RateLimitController:call'],
  }) as RateLimitMessenger<RateLimitedApis>;
}

const origin = 'snap_test';
const message = 'foo';
const successResult = { isRateLimited: false, result: undefined };

describe('RateLimitController', () => {
  jest.useFakeTimers();

  it('action: RateLimitController:call', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const controller = new RateLimitController({
      implementations,
      messenger,
    });
    expect(
      await unrestricted.call(
        'RateLimitController:call',
        origin,
        'showNativeNotification',
        origin,
        message,
      ),
    ).toStrictEqual(successResult);

    expect(implementations.showNativeNotification).toHaveBeenCalledWith(
      origin,
      message,
    );
  });

  it('uses showNativeNotification to show a notification', async () => {
    const messenger = getRestrictedMessenger();

    const showNativeNotification = jest.fn();
    const controller = new RateLimitController({
      implementations: { showNativeNotification },
      messenger,
    });
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
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
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toStrictEqual(successResult);

    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
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
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toStrictEqual(successResult);
    jest.runAllTimers();
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toStrictEqual(successResult);
    expect(showNativeNotification).toHaveBeenCalledTimes(2);
    expect(showNativeNotification).toHaveBeenCalledWith(origin, message);
  });
});
