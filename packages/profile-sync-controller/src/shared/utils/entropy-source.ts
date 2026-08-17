import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringObject } from '@metamask/keyring-controller';

/**
 * Reads HD keyring entropy source IDs (metadata IDs) from KeyringController
 * keyrings, primary first. Returns an empty array when none are available
 * (e.g. the wallet is locked, where `keyrings` is cleared).
 *
 * @param keyrings - Keyrings from `KeyringController:getState`.
 * @returns The HD keyring metadata IDs, primary first.
 */
export function getHdKeyringEntropySourceIds(
  keyrings: KeyringObject[] | null | undefined,
): string[] {
  return (keyrings ?? [])
    .filter((keyring) => keyring.type === KeyringTypes.hd.toString())
    .map((keyring) => keyring.metadata.id);
}

/**
 * Resolves the primary SRP's entropy source ID (the first HD keyring's
 * metadata ID). The ID is randomly regenerated whenever the vault is
 * recreated (e.g. on restore).
 *
 * @param keyrings - Keyrings from `KeyringController:getState`.
 * @returns The primary HD keyring metadata ID.
 * @throws If no HD keyring is available; callers must only resolve while
 * the wallet is unlocked.
 */
export function getPrimaryHdKeyringEntropySourceId(
  keyrings: KeyringObject[] | null | undefined,
): string {
  const [primaryEntropySourceId] = getHdKeyringEntropySourceIds(keyrings);
  if (!primaryEntropySourceId) {
    throw new Error(
      'getPrimaryHdKeyringEntropySourceId - no HD keyring available',
    );
  }
  return primaryEntropySourceId;
}
