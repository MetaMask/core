import type { KeyringControllerState } from './KeyringController.js';
import { KeyringTypes } from './KeyringController.js';

/**
 * Select all HD keyring entropy source IDs.
 *
 * @param state - KeyringController state
 * @returns A list of HD keyring entropy source IDs.
 */
export const selectHdKeyringEntropySourceIds = (
  state: KeyringControllerState,
): string[] =>
  state.keyrings
    .filter((keyring) => keyring.type === KeyringTypes.hd.toString())
    .map((keyring) => keyring.metadata.id);

/**
 * Select the primary HD keyring entropy source ID.
 *
 * @param state - KeyringController state
 * @returns The primary HD keyring entropy source ID.
 */
export const selectPrimaryHdKeyringEntropySourceId = (
  state: KeyringControllerState,
): string | undefined => selectHdKeyringEntropySourceIds(state)[0];
