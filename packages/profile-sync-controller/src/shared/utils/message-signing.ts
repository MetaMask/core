import type { HardenedBIP32Node } from '@metamask/key-tree';
import { SLIP10Node } from '@metamask/key-tree';
import {
  assert,
  bytesToHex,
  concatBytes,
  createDataView,
  hexToBytes,
  stringToBytes,
} from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';

/**
 * Native SIP-6 message-signing helpers for AuthenticationController /
 * UserStorageController.
 *
 * These are intentional copies of the message-signing snap crypto path so auth
 * and user-storage can derive/sign without booting
 * `npm:@metamask/message-signing-snap`. Behavior must stay byte-identical to:
 *
 * - SIP-6 derivation:
 *   `@metamask/snaps-rpc-methods` `deriveEntropyFromSeed` /
 *   `getEntropyDerivationPath` / `getDerivationPathArray`
 *   (https://github.com/MetaMask/snaps/blob/main/packages/snaps-rpc-methods/src/utils.ts)
 * - Magic constant:
 *   `@metamask/snaps-utils` `SIP_6_MAGIC_VALUE`
 * - Pubkey + `metamask:…` signing:
 *   `@metamask/message-signing-snap` `getPublicEntropyKey` /
 *   `signMessageWithEntropyKey`
 *   (https://github.com/MetaMask/message-signing-snap/blob/main/src/entropy-keys.ts)
 *
 * `deriveEntropyFromSeed` is not a public export of
 * `@metamask/snaps-rpc-methods` today (and no core package depends on that
 * package), so the SIP-6 math is vendored here rather than imported.
 */

/**
 * Snap ID used as the SIP-6 `input` so derived keys match
 * `@metamask/message-signing-snap` (`snap_getEntropy` origin).
 */
export const MESSAGE_SIGNING_SNAP_ID = 'npm:@metamask/message-signing-snap';

/**
 * Copy of `@metamask/snaps-utils` `SIP_6_MAGIC_VALUE`
 * (`0xd36e6170 - 0x80000000`).
 *
 * @see https://metamask.github.io/SIPs/SIPS/sip-6
 */
const SIP_6_MAGIC_VALUE = `1399742832'` as `${number}'`;

const HARDENED_VALUE = 0x80000000;

/**
 * HMAC-SHA-512 for `@metamask/key-tree`.
 *
 * Passed into `SLIP10Node.fromSeed` so SIP-6 never uses Web Crypto.
 * `@metamask/key-tree` treats any `crypto.subtle` as complete and then HMAC
 * via `importKey` / `sign`. React Native only implements `digest`; its
 * SubtleCrypto cannot HMAC. Noble HMAC is byte-identical without SubtleCrypto.
 */
const NOBLE_HMAC_SHA512 = {
  hmacSha512: async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> =>
    hmac(sha512, key, data),
};

/**
 * Copy of `@metamask/snaps-rpc-methods` `getDerivationPathArray`.
 *
 * Maps a 32-byte hash to eight hardened BIP-32 indices for `@metamask/key-tree`.
 *
 * @param hash - 32-byte hash.
 * @returns Hardened BIP-32 path nodes.
 */
function getDerivationPathArray(hash: Uint8Array): HardenedBIP32Node[] {
  const array: HardenedBIP32Node[] = [];
  const view = createDataView(hash);

  for (let index = 0; index < 8; index++) {
    const uint32 = view.getUint32(index * 4);
    // eslint-disable-next-line no-bitwise
    const pathIndex = (uint32 | HARDENED_VALUE) >>> 0;
    array.push(`bip32:${pathIndex - HARDENED_VALUE}'` as const);
  }

  return array;
}

/**
 * Copy of `@metamask/snaps-rpc-methods` `deriveEntropyFromSeed` (SIP-6),
 * returning raw private-key bytes instead of a `0x`-prefixed hex string.
 *
 * @param options - Derivation options.
 * @param options.seed - BIP-39 mnemonic seed.
 * @param options.input - SIP-6 input (snap ID for `snap_getEntropy`).
 * @param options.salt - Optional salt. Internal auth uses `''`.
 * @returns 32-byte private key.
 */
export async function deriveSip6PrivateKey({
  seed,
  input,
  salt = '',
}: {
  seed: Uint8Array;
  input: string;
  salt?: string;
}): Promise<Uint8Array> {
  const hash = keccak256(
    concatBytes([stringToBytes(input), keccak256(stringToBytes(salt))]),
  );
  const computedDerivationPath = getDerivationPathArray(hash);

  const { privateKey } = await SLIP10Node.fromSeed(
    {
      derivationPath: [
        seed,
        `bip32:${SIP_6_MAGIC_VALUE}`,
        ...computedDerivationPath,
      ],
      curve: 'secp256k1',
    },
    NOBLE_HMAC_SHA512,
  );

  assert(privateKey, 'Failed to derive SIP-6 entropy.');
  return hexToBytes(privateKey);
}

/**
 * Derives the message-signing private key via SIP-6, matching
 * `snap_getEntropy` for the message-signing snap with empty salt
 * (internal `metamask` origin).
 *
 * @param seed - BIP-39 mnemonic seed from an HD keyring.
 * @param salt - Optional SIP-6 salt. Auth / user-storage use `''`.
 * @returns 32-byte private key.
 */
export async function deriveMessageSigningPrivateKey(
  seed: Uint8Array,
  salt = '',
): Promise<Uint8Array> {
  return deriveSip6PrivateKey({
    seed,
    input: MESSAGE_SIGNING_SNAP_ID,
    salt,
  });
}

/**
 * Copy of message-signing-snap `getPublicEntropyKey`: secp256k1 pubkey hex
 * for the SIP-6 message-signing private key.
 *
 * @param seed - BIP-39 mnemonic seed from an HD keyring.
 * @param salt - Optional SIP-6 salt. Auth / user-storage use `''`.
 * @returns Public key hex with `0x` prefix.
 */
export async function getMessageSigningPublicKey(
  seed: Uint8Array,
  salt = '',
): Promise<string> {
  const privateKey = await deriveMessageSigningPrivateKey(seed, salt);
  return bytesToHex(secp256k1.getPublicKey(privateKey));
}

/**
 * Copy of message-signing-snap `signMessageWithEntropyKey`: sha256(message)
 * then compact secp256k1 signature.
 *
 * @param message - Message to sign (must be validated by the caller).
 * @param seed - BIP-39 mnemonic seed from an HD keyring.
 * @param salt - Optional SIP-6 salt. Auth / user-storage use `''`.
 * @returns Compact secp256k1 signature hex with `0x` prefix.
 */
export async function signMessageWithMessageSigningKey(
  message: string,
  seed: Uint8Array,
  salt = '',
): Promise<string> {
  const privateKey = await deriveMessageSigningPrivateKey(seed, salt);
  const digest = sha256(message);
  const signature = secp256k1.sign(digest, privateKey);
  return `0x${signature.toCompactHex()}`;
}
