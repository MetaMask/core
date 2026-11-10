import { ecsign, hashPersonalMessage, publicToAddress } from '@ethereumjs/util';
import type { ToBytesInputTypes } from '@ethereumjs/util';
import { bigIntToBytes, bytesToHex } from '@metamask/utils';

import {
  concatSig,
  isNullish,
  legacyToBytes,
  recoverPublicKey,
} from './utils.js';

/**
 * Create an Ethereum-specific signature for a message.
 *
 * This function is equivalent to the `eth_sign` Ethereum JSON-RPC method as specified in EIP-1417,
 * as well as the MetaMask's `personal_sign` method.
 *
 * @param options - The personal sign options.
 * @param options.privateKey - The key to sign with.
 * @param options.data - The hex data to sign.
 * @returns The '0x'-prefixed hex encoded signature.
 */
export function personalSign({
  privateKey,
  data,
}: {
  privateKey: Uint8Array;
  data: ToBytesInputTypes;
}): string {
  if (isNullish(data)) {
    throw new Error('Missing data parameter');
  } else if (isNullish(privateKey)) {
    throw new Error('Missing privateKey parameter');
  }

  const message = legacyToBytes(data);
  const msgHash = hashPersonalMessage(message);
  const signature = ecsign(msgHash, privateKey);
  return concatSig(bigIntToBytes(signature.v), signature.r, signature.s);
}

/**
 * Recover the address of the account used to create the given Ethereum signature. The message
 * must have been signed using the `personalSign` function, or an equivalent function.
 *
 * @param options - The signature recovery options.
 * @param options.data - The hex data that was signed.
 * @param options.signature - The '0x'-prefixed hex encoded message signature.
 * @returns The '0x'-prefixed hex encoded address of the message signer.
 */
export function recoverPersonalSignature({
  data,
  signature,
}: {
  data: ToBytesInputTypes;
  signature: string;
}): string {
  if (isNullish(data)) {
    throw new Error('Missing data parameter');
  } else if (isNullish(signature)) {
    throw new Error('Missing signature parameter');
  }

  const publicKey = getPublicKeyFor(data, signature);
  const sender = publicToAddress(publicKey);
  const senderHex = bytesToHex(sender);
  return senderHex;
}

/**
 * Recover the public key of the account used to create the given Ethereum signature. The message
 * must have been signed using the `personalSign` function, or an equivalent function.
 *
 * @param options - The public key recovery options.
 * @param options.data - The hex data that was signed.
 * @param options.signature - The '0x'-prefixed hex encoded message signature.
 * @returns The '0x'-prefixed hex encoded public key of the message signer.
 */
export function extractPublicKey({
  data,
  signature,
}: {
  data: ToBytesInputTypes;
  signature: string;
}): string {
  if (isNullish(data)) {
    throw new Error('Missing data parameter');
  } else if (isNullish(signature)) {
    throw new Error('Missing signature parameter');
  }

  const publicKey = getPublicKeyFor(data, signature);
  return bytesToHex(publicKey);
}

/**
 * Get the public key for the given signature and message.
 *
 * @param message - The message that was signed.
 * @param signature - The '0x'-prefixed hex encoded message signature.
 * @returns The public key of the signer.
 */
function getPublicKeyFor(
  message: ToBytesInputTypes,
  signature: string,
): Uint8Array {
  const messageHash = hashPersonalMessage(legacyToBytes(message));
  return recoverPublicKey(messageHash, signature);
}
