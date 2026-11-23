import { describe, expect, it, vi } from 'vitest';

import type { TransactionPayControllerMessenger } from '../types.js';
import { waitForKeyringUnlock } from './keyring.js';

function getMessengerMock({ isUnlocked }: { isUnlocked: boolean }): {
  messenger: TransactionPayControllerMessenger;
  subscribe: ReturnType<typeof vi.fn>;
  unlock: () => void;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  const handlers: (() => void)[] = [];
  const subscribe = vi.fn((_event: string, handler: () => void) => {
    handlers.push(handler);
  });
  const unsubscribe = vi.fn();

  return {
    messenger: {
      call: vi.fn().mockReturnValue({ isUnlocked }),
      subscribe,
      unsubscribe,
    } as unknown as TransactionPayControllerMessenger,
    subscribe,
    unlock: (): void => handlers.forEach((handler) => handler()),
    unsubscribe,
  };
}

describe('waitForKeyringUnlock', () => {
  it('resolves immediately if the keyring is already unlocked', async () => {
    const { messenger, subscribe } = getMessengerMock({ isUnlocked: true });

    expect(await waitForKeyringUnlock(messenger)).toBeUndefined();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('resolves once the keyring is unlocked', async () => {
    const { messenger, subscribe, unlock } = getMessengerMock({
      isUnlocked: false,
    });
    const onResolved = vi.fn();
    const promise = waitForKeyringUnlock(messenger).then(onResolved);

    await Promise.resolve();

    expect(subscribe).toHaveBeenCalledWith(
      'KeyringController:unlock',
      expect.any(Function),
    );
    expect(onResolved).not.toHaveBeenCalled();

    unlock();
    await promise;

    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the same handler after unlock', async () => {
    const { messenger, subscribe, unlock, unsubscribe } = getMessengerMock({
      isUnlocked: false,
    });
    const promise = waitForKeyringUnlock(messenger);

    unlock();
    await promise;

    expect(unsubscribe).toHaveBeenCalledWith(
      'KeyringController:unlock',
      subscribe.mock.calls[0][1],
    );
  });
});
