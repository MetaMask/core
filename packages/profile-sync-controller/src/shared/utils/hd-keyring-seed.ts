import type { HdKeyring } from '@metamask/eth-hd-keyring/v2';
import type { KeyringType } from '@metamask/keyring-api/v2';
import type { KeyringControllerWithKeyringV2UnsafeAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

/**
 * HD keyring seed access for native SIP-6 message signing.
 *
 * This mirrors `@metamask/snaps-rpc-methods` `getMnemonicSeed` (when called
 * with an entropy source id):
 * `KeyringController:withKeyringV2Unsafe` → assert HD → return `keyring.seed`.
 *
 * Those helpers are not a public export of snaps-rpc-methods, so this thin wrapper lives here.
 *
 * @see https://github.com/MetaMask/snaps/blob/main/packages/snaps-rpc-methods/src/utils.ts
 */

/**
 * V2 HD keyring type (`KeyringType.Hd`). The template type keeps the literal
 * aligned with `@metamask/keyring-api/v2` without a runtime dependency.
 */
const HD_KEYRING_TYPE: `${KeyringType.Hd}` = 'hd';

const ENTROPY_SOURCE_NOT_FOUND_ERROR =
  'Entropy source not found or is not an HD keyring.';

/**
 * Structural messenger shape for `withKeyringV2Unsafe`.
 *
 * Not `Messenger<string, KeyringControllerWithKeyringV2UnsafeAction>` because
 * `Messenger` is invariant in its action union — Auth / UserStorage messengers
 * (which allow additional actions) are not assignable to that narrow type.
 */
type MessengerWithKeyringV2Unsafe = {
  call: (
    ...args: Parameters<
      Messenger<string, KeyringControllerWithKeyringV2UnsafeAction>['call']
    >
  ) => unknown;
};

/**
 * Reads the BIP-39 seed for an HD keyring entropy source via
 * `KeyringController:withKeyringV2Unsafe`.
 *
 * Equivalent to snaps-rpc-methods `getMnemonicSeed(messenger, source)` for a
 * concrete entropy source id.
 *
 * @param messenger - Messenger that can call `withKeyringV2Unsafe`.
 * @param entropySourceId - Keyring metadata ID (SIP-30 entropy source).
 * @returns The HD keyring seed.
 * @throws If the keyring is missing or is not an HD keyring with a seed.
 */
export async function getHdKeyringSeed(
  messenger: MessengerWithKeyringV2Unsafe,
  entropySourceId: string,
): Promise<Uint8Array> {
  try {
    const keyringData = (await messenger.call(
      'KeyringController:withKeyringV2Unsafe',
      { id: entropySourceId },
      async ({ keyring }) => {
        const hdKeyring = keyring as HdKeyring;
        return { type: hdKeyring.type, seed: hdKeyring.seed };
      },
    )) as { type: string; seed?: Uint8Array | null };

    if (keyringData.type !== HD_KEYRING_TYPE || !keyringData.seed) {
      throw new Error(ENTROPY_SOURCE_NOT_FOUND_ERROR);
    }

    return keyringData.seed;
  } catch {
    throw new Error(ENTROPY_SOURCE_NOT_FOUND_ERROR);
  }
}
