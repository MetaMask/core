import { ControllerMessenger } from '../ControllerMessenger';
import {
  RateLimitControllerActions,
  RateLimitStateChange,
  RateLimitController,
  RateLimitMessenger,
  GetRateLimitState,
  CallApi,
} from './RateLimitController';

const name = 'RateLimitController';

const implementations = {
  showNativeNotification: jest.fn(),
};

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
    RateLimitControllerActions<RateLimitedApis>['type'],
    never
  >({
    name,
    allowedActions: ['RateLimitController:call'],
  }) as RateLimitMessenger<RateLimitedApis>;
}

const origin = 'snap_test';
const message = 'foo';

describe('RateLimitController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    implementations.showNativeNotification.mockClear();
    jest.useRealTimers();
  });

  it('action: RateLimitController:call', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    // Registers action handlers
    new RateLimitController({
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
    ).toBeUndefined();

    expect(implementations.showNativeNotification).toHaveBeenCalledWith(
      origin,
      message,
    );
  });

  it('uses showNativeNotification to show a notification', async () => {
    const messenger = getRestrictedMessenger();

    const controller = new RateLimitController({
      implementations,
      messenger,
    });
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toBeUndefined();

    expect(implementations.showNativeNotification).toHaveBeenCalledWith(
      origin,
      message,
    );
  });

  it('returns false if rate-limited', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new RateLimitController({
      implementations,
      messenger,
      rateLimitCount: 1,
    });

    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toBeUndefined();

    await expect(
      controller.call(origin, 'showNativeNotification', origin, message),
    ).rejects.toThrow(
      `"showNativeNotification" is currently rate-limited. Please try again later`,
    );
    expect(implementations.showNativeNotification).toHaveBeenCalledTimes(1);
    expect(implementations.showNativeNotification).toHaveBeenCalledWith(
      origin,
      message,
    );
  });

  it('rate limit is reset after timeout', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new RateLimitController({
      implementations,
      messenger,
      rateLimitCount: 1,
    });
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toBeUndefined();
    jest.runAllTimers();
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toBeUndefined();
    expect(implementations.showNativeNotification).toHaveBeenCalledTimes(2);
    expect(implementations.showNativeNotification).toHaveBeenCalledWith(
      origin,
      message,
    );
  });

  it('timeout is only applied once per window', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new RateLimitController({
      implementations,
      messenger,
      rateLimitCount: 2,
    });
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toBeUndefined();
    jest.advanceTimersByTime(2500);
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toBeUndefined();
    expect(controller.state.requests.showNativeNotification[origin]).toBe(2);
    jest.advanceTimersByTime(2500);
    expect(controller.state.requests.showNativeNotification[origin]).toBe(0);
    expect(
      await controller.call(origin, 'showNativeNotification', origin, message),
    ).toBeUndefined();
    jest.advanceTimersByTime(2500);
    expect(controller.state.requests.showNativeNotification[origin]).toBe(1);
  });
});
