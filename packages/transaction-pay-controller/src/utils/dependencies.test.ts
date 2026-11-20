import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransactionPayControllerMessenger } from '../types.js';
import {
  DEPENDENCY_MAX_ATTEMPTS,
  DEPENDENCY_RETRY_INTERVAL_MS,
  TRANSACTION_PAY_CONTROLLER_DEPENDENCIES,
  waitForDependencies,
} from './dependencies.js';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<TransactionPayControllerMessenger>,
  MessengerEvents<TransactionPayControllerMessenger>
>;

/**
 * Creates a controller messenger with every dependency delegated from a root
 * messenger, and a function to register a dependency's handler on the root.
 *
 * @returns The messenger and a function to register a dependency.
 */
function getMessengers(): {
  messenger: TransactionPayControllerMessenger;
  register: (action: string) => void;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const messenger: TransactionPayControllerMessenger = new Messenger({
    namespace: 'TransactionPayController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: TRANSACTION_PAY_CONTROLLER_DEPENDENCIES,
    messenger,
  });

  return {
    messenger,
    register: (action): void =>
      rootMessenger.registerActionHandler(
        action as (typeof TRANSACTION_PAY_CONTROLLER_DEPENDENCIES)[number],
        vi.fn(),
      ),
  };
}

describe('waitForDependencies', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true if all dependencies are registered', async () => {
    const { messenger, register } = getMessengers();

    TRANSACTION_PAY_CONTROLLER_DEPENDENCIES.forEach(register);

    expect(await waitForDependencies(messenger)).toBe(true);
  });

  it('retries until missing dependencies are registered', async () => {
    const { messenger, register } = getMessengers();
    const [lastDependency, ...otherDependencies] = [
      ...TRANSACTION_PAY_CONTROLLER_DEPENDENCIES,
    ].reverse();

    otherDependencies.forEach(register);

    const onResolved = vi.fn();
    const promise = waitForDependencies(messenger).then(onResolved);

    await vi.advanceTimersByTimeAsync(DEPENDENCY_RETRY_INTERVAL_MS - 1);
    expect(onResolved).not.toHaveBeenCalled();

    register(lastDependency);
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(onResolved).toHaveBeenCalledWith(true);
  });

  it('returns false if dependencies are still missing after the last check', async () => {
    const { messenger } = getMessengers();
    const callSpy = vi.spyOn(messenger, 'call');

    const promise = waitForDependencies(messenger);

    await vi.advanceTimersByTimeAsync(
      DEPENDENCY_RETRY_INTERVAL_MS * (DEPENDENCY_MAX_ATTEMPTS - 1),
    );

    expect(await promise).toBe(false);
    expect(callSpy).toHaveBeenCalledTimes(
      TRANSACTION_PAY_CONTROLLER_DEPENDENCIES.length * DEPENDENCY_MAX_ATTEMPTS,
    );
  });
});
