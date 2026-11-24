import type { TransactionPayControllerMessenger } from '../types.js';

/**
 * Returns a promise that resolves once the KeyringController is unlocked.
 * Resolves immediately if already unlocked.
 *
 * @param messenger - The controller messenger.
 * @returns A promise that resolves when the wallet is unlocked.
 */
export function waitForKeyringUnlock(
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { isUnlocked } = messenger.call('KeyringController:getState');

  if (isUnlocked) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handler = (): void => {
      messenger.unsubscribe('KeyringController:unlock', handler);
      resolve();
    };

    messenger.subscribe('KeyringController:unlock', handler);
  });
}
