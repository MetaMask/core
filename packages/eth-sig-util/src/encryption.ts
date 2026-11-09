import { getRandomBytes } from '@metamask/cryptography';
import {
  generateKeyPair,
  getPublicKey,
  getSharedSecret,
} from '@metamask/cryptography/x25519';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToString,
  stringToBytes,
} from '@metamask/utils';
import { hsalsa, xsalsa20poly1305 } from '@noble/ciphers/salsa';
import { u8, u32 } from '@noble/ciphers/utils';

import { isNullish } from './utils.js';

export type EthEncryptedData = {
  version: string;
  nonce: string;
  ephemPublicKey: string;
  ciphertext: string;
};

const DEFAULT_PADDING_LENGTH = 2048;
// https://github.com/dchest/tweetnacl-js/blob/master/nacl.js#L128
const HSALSA_SIGMA = u32(stringToBytes('expand 32-byte k'));

/**
 * Derive the symmetric key used for `x25519-xsalsa20-poly1305`.
 *
 * @param privateKey - The 32-byte X25519 private key.
 * @param publicKey - The 32-byte X25519 public key of the peer.
 * @returns The 32-byte symmetric key.
 */
async function deriveEncryptionKey(
  privateKey: Uint8Array<ArrayBuffer>,
  publicKey: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const sharedSecret = await getSharedSecret(privateKey, publicKey);
  const key = new Uint32Array(8);
  // https://github.com/dchest/tweetnacl-js/blob/master/nacl.js#L451
  hsalsa(HSALSA_SIGMA, u32(sharedSecret), new Uint32Array(4), key);
  return u8(key);
}

/**
 * Encrypt a message.
 *
 * @param options - The encryption options.
 * @param options.publicKey - The public key of the message recipient.
 * @param options.data - The message data.
 * @param options.version - The type of encryption to use.
 * @returns The encrypted data.
 */
export async function encrypt({
  publicKey,
  data,
  version,
}: {
  publicKey: string;
  data: unknown;
  version: string;
}): Promise<EthEncryptedData> {
  if (isNullish(publicKey)) {
    throw new Error('Missing publicKey parameter');
  } else if (isNullish(data)) {
    throw new Error('Missing data parameter');
  } else if (isNullish(version)) {
    throw new Error('Missing version parameter');
  }

  switch (version) {
    case 'x25519-xsalsa20-poly1305': {
      if (typeof data !== 'string') {
        throw new Error('Message data must be given as a string');
      }
      // generate ephemeral keypair
      const ephemeralKeyPair = await generateKeyPair();

      // assemble encryption parameters - from string to UInt8
      let pubKeyUInt8Array: Uint8Array<ArrayBuffer>;
      try {
        pubKeyUInt8Array = base64ToBytes(publicKey);
      } catch {
        throw new Error('Bad public key');
      }

      const msgParamsUInt8Array = stringToBytes(data);
      const nonce = getRandomBytes(xsalsa20poly1305.nonceLength);

      // encrypt
      const key = await deriveEncryptionKey(
        ephemeralKeyPair.privateKey,
        pubKeyUInt8Array,
      );
      const encryptedMessage = xsalsa20poly1305(key, nonce).encrypt(
        msgParamsUInt8Array,
      );

      // handle encrypted data
      const output = {
        version: 'x25519-xsalsa20-poly1305',
        nonce: bytesToBase64(nonce),
        ephemPublicKey: bytesToBase64(ephemeralKeyPair.publicKey),
        ciphertext: bytesToBase64(encryptedMessage),
      };
      // return encrypted msg data
      return output;
    }

    default:
      throw new Error('Encryption type/version not supported');
  }
}

/**
 * Encrypt a message in a way that obscures the message length.
 *
 * The message is padded to a multiple of 2048 before being encrypted so that the length of the
 * resulting encrypted message can't be used to guess the exact length of the original message.
 *
 * @param options - The encryption options.
 * @param options.publicKey - The public key of the message recipient.
 * @param options.data - The message data.
 * @param options.version - The type of encryption to use.
 * @returns The encrypted data.
 */
export async function encryptSafely({
  publicKey,
  data,
  version,
}: {
  publicKey: string;
  data: unknown;
  version: string;
}): Promise<EthEncryptedData> {
  if (isNullish(publicKey)) {
    throw new Error('Missing publicKey parameter');
  } else if (isNullish(data)) {
    throw new Error('Missing data parameter');
  } else if (isNullish(version)) {
    throw new Error('Missing version parameter');
  }

  if (typeof data === 'object' && data && 'toJSON' in data) {
    // remove toJSON attack vector
    // TODO, check all possible children
    throw new Error(
      'Cannot encrypt with toJSON property.  Please remove toJSON property',
    );
  }

  // add padding
  const dataWithPadding = {
    data,
    padding: '',
  };

  // calculate padding
  const ciphertextLength =
    Buffer.byteLength(JSON.stringify(dataWithPadding), 'utf-8') +
    xsalsa20poly1305.tagLength;
  const remainder = ciphertextLength % DEFAULT_PADDING_LENGTH;
  const padLength = remainder === 0 ? 0 : DEFAULT_PADDING_LENGTH - remainder;
  dataWithPadding.padding = '0'.repeat(padLength);

  const paddedMessage = JSON.stringify(dataWithPadding);
  return encrypt({ publicKey, data: paddedMessage, version });
}

/**
 * Decrypt a message.
 *
 * @param options - The decryption options.
 * @param options.encryptedData - The encrypted data.
 * @param options.privateKey - The private key to decrypt with.
 * @returns The decrypted message.
 */
export async function decrypt({
  encryptedData,
  privateKey,
}: {
  encryptedData: EthEncryptedData;
  privateKey: string;
}): Promise<string> {
  if (isNullish(encryptedData)) {
    throw new Error('Missing encryptedData parameter');
  } else if (isNullish(privateKey)) {
    throw new Error('Missing privateKey parameter');
  }

  switch (encryptedData.version) {
    case 'x25519-xsalsa20-poly1305': {
      const receiverPrivateKeyUint8Array = Buffer.from(privateKey, 'hex');

      // assemble decryption parameters
      const nonce = base64ToBytes(encryptedData.nonce);
      const ciphertext = base64ToBytes(encryptedData.ciphertext);
      const ephemPublicKey = base64ToBytes(encryptedData.ephemPublicKey);

      // decrypt
      const key = await deriveEncryptionKey(
        receiverPrivateKeyUint8Array,
        ephemPublicKey,
      );
      const cipher = xsalsa20poly1305(key, nonce);

      let decryptedMessage: Uint8Array;
      try {
        decryptedMessage = cipher.decrypt(ciphertext);
      } catch {
        throw new Error('Decryption failed.');
      }

      // return decrypted msg data
      try {
        return bytesToString(decryptedMessage);
      } catch (error) {
        if (error instanceof Error && error.message.length) {
          throw new Error(`Decryption failed: ${error.message}`);
        }
        throw new Error(`Decryption failed.`);
      }
    }

    default:
      throw new Error('Encryption type/version not supported.');
  }
}

/**
 * Decrypt a message that has been encrypted using `encryptSafely`.
 *
 * @param options - The decryption options.
 * @param options.encryptedData - The encrypted data.
 * @param options.privateKey - The private key to decrypt with.
 * @returns The decrypted message.
 */
export async function decryptSafely({
  encryptedData,
  privateKey,
}: {
  encryptedData: EthEncryptedData;
  privateKey: string;
}): Promise<string> {
  if (isNullish(encryptedData)) {
    throw new Error('Missing encryptedData parameter');
  } else if (isNullish(privateKey)) {
    throw new Error('Missing privateKey parameter');
  }

  const dataWithPadding = JSON.parse(
    await decrypt({ encryptedData, privateKey }),
  );
  return dataWithPadding.data;
}

/**
 * Get the encryption public key for the given key.
 *
 * @param privateKey - The private key to generate the encryption public key with.
 * @returns The encryption public key.
 */
export async function getEncryptionPublicKey(
  privateKey: string,
): Promise<string> {
  const privateKeyUint8Array = Buffer.from(privateKey, 'hex');
  const encryptionPublicKey = await getPublicKey(privateKeyUint8Array);
  return bytesToBase64(encryptionPublicKey);
}
