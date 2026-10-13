import { selectPrimaryHdKeyringEntropySourceId } from '@metamask/keyring-controller';
import type { KeyringControllerState } from '@metamask/keyring-controller';

/**
 * Resolves the primary SRP's entropy source ID (the first HD keyring's
 * metadata ID). The ID is randomly regenerated whenever the vault is
 * recreated (e.g. on restore).
 *
 * @param keyringState - KeyringController state.
 * @returns The primary HD keyring metadata ID.
 * @throws If no HD keyring is available; callers must only resolve while
 * the wallet is unlocked.
 */
export function getPrimaryHdKeyringEntropySourceId(
  keyringState: KeyringControllerState,
): string {
  const primaryEntropySourceId =
    selectPrimaryHdKeyringEntropySourceId(keyringState);
  if (!primaryEntropySourceId) {
    throw new Error(
      'getPrimaryHdKeyringEntropySourceId - no HD keyring available',
    );
  }
  return primaryEntropySourceId;
}
