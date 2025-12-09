import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { RateLimitMessenger } from './RateLimitController';
import { RateLimitController } from './RateLimitController';

const controllerName = 'RateLimitController';

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

type AllRateLimitControllerActions = MessengerActions<
  RateLimitMessenger<RateLimitedApis>
>;

type AllRateLimitControllerEvents = MessengerEvents<
  RateLimitMessenger<RateLimitedApis>
>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllRateLimitControllerActions,
  AllRateLimitControllerEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Constructs a messenger for the RateLimitController.
 *
 * @param rootMessenger - An optional root messenger
 * @returns A messenger for the RateLimitController.
 */
function getMessenger(
  rootMessenger = getRootMessenger(),
): RateLimitMessenger<RateLimitedApis> {
  return new Messenger<
    typeof controllerName,
    AllRateLimitControllerActions,
    AllRateLimitControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
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
    const rootMessenger = getRootMessenger();
    const messenger = getMessenger(rootMessenger);

    // Registers action handlers
    new RateLimitController({
      implementations,
      messenger,
    });

    expect(
      await rootMessenger.call(
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
    const messenger = getMessenger();

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
    const messenger = getMessenger();
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
    const messenger = getMessenger();
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
    const messenger = getMessenger();
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

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = new RateLimitController({
        implementations,
        messenger: getMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`Object {}`);
    });

    it('includes expected state in state logs', () => {
      const controller = new RateLimitController({
        implementations,
        messenger: getMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`Object {}`);
    });

    it('persists expected state', () => {
      const controller = new RateLimitController({
        implementations,
        messenger: getMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`Object {}`);
    });

    it('exposes expected state to UI', () => {
      const controller = new RateLimitController({
        implementations,
        messenger: getMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`Object {}`);
    });
  });
});
