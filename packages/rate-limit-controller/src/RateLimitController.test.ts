import { ControllerMessenger } from '@metamask/base-controller';

import type {
  RateLimitControllerActions,
  RateLimitControllerEvents,
} from './RateLimitController';
import { RateLimitController } from './RateLimitController';

const name = 'RateLimitController';

const implementations = {
  apiWithoutCustomLimit: {
    method: jest.fn(),
  },
  apiWithCustomLimit: {
    method: jest.fn(),
    rateLimitCount: 2,
    rateLimitTimeout: 3000,
  },
};

type RateLimitedApis = typeof implementations;

/**
 * Constructs a unrestricted controller messenger.
 *
 * @returns A unrestricted controller messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<
    RateLimitControllerActions<RateLimitedApis>,
    RateLimitControllerEvents<RateLimitedApis>
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

describe('RateLimitController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    implementations.apiWithoutCustomLimit.method.mockClear();
    implementations.apiWithCustomLimit.method.mockClear();
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
        'apiWithoutCustomLimit',
        origin,
        message,
      ),
    ).toBeUndefined();

    expect(implementations.apiWithoutCustomLimit.method).toHaveBeenCalledWith(
      origin,
      message,
    );
  });

  it('uses apiWithoutCustomLimit method', async () => {
    const messenger = getRestrictedMessenger();

    const controller = new RateLimitController({
      implementations,
      messenger,
    });
    expect(
      await controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).toBeUndefined();

    expect(implementations.apiWithoutCustomLimit.method).toHaveBeenCalledWith(
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
      await controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).toBeUndefined();

    await expect(
      controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).rejects.toThrow(
      `"apiWithoutCustomLimit" is currently rate-limited. Please try again later`,
    );

    expect(
      await controller.call(origin, 'apiWithCustomLimit', origin, message),
    ).toBeUndefined();

    expect(
      await controller.call(origin, 'apiWithCustomLimit', origin, message),
    ).toBeUndefined();

    await expect(
      controller.call(origin, 'apiWithCustomLimit', origin, message),
    ).rejects.toThrow(
      `"apiWithCustomLimit" is currently rate-limited. Please try again later`,
    );

    expect(implementations.apiWithoutCustomLimit.method).toHaveBeenCalledTimes(
      1,
    );

    expect(implementations.apiWithCustomLimit.method).toHaveBeenCalledTimes(2);

    expect(implementations.apiWithoutCustomLimit.method).toHaveBeenCalledWith(
      origin,
      message,
    );

    expect(implementations.apiWithCustomLimit.method).toHaveBeenCalledWith(
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
      await controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).toBeUndefined();
    jest.runAllTimers();
    expect(
      await controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).toBeUndefined();

    expect(
      await controller.call(origin, 'apiWithCustomLimit', origin, message),
    ).toBeUndefined();

    expect(
      await controller.call(origin, 'apiWithCustomLimit', origin, message),
    ).toBeUndefined();

    jest.runAllTimers();

    expect(
      await controller.call(origin, 'apiWithCustomLimit', origin, message),
    ).toBeUndefined();

    expect(implementations.apiWithoutCustomLimit.method).toHaveBeenCalledTimes(
      2,
    );
    expect(implementations.apiWithoutCustomLimit.method).toHaveBeenCalledWith(
      origin,
      message,
    );

    expect(implementations.apiWithCustomLimit.method).toHaveBeenCalledTimes(3);
    expect(implementations.apiWithCustomLimit.method).toHaveBeenCalledWith(
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
      await controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).toBeUndefined();
    jest.advanceTimersByTime(2500);
    expect(
      await controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).toBeUndefined();
    expect(controller.state.requests.apiWithoutCustomLimit[origin]).toBe(2);
    jest.advanceTimersByTime(2500);
    expect(controller.state.requests.apiWithoutCustomLimit[origin]).toBe(0);
    expect(
      await controller.call(origin, 'apiWithoutCustomLimit', origin, message),
    ).toBeUndefined();
    jest.advanceTimersByTime(2500);
    expect(controller.state.requests.apiWithoutCustomLimit[origin]).toBe(1);
  });
});
