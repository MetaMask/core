import type { KeyPair } from '@metamask/toprf-secure-backup';
import { gcm } from '@noble/ciphers/aes';
import { bytesToNumberBE } from '@noble/ciphers/utils';
import { managedNonce } from '@noble/ciphers/webcrypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

export class MockToprfEncryptorDecryptor {
  readonly #HKDF_ENCRYPTION_KEY_INFO = 'encryption-key';

  readonly #HKDF_AUTH_KEY_INFO = 'authentication-key';

  encrypt(key: Uint8Array, data: Uint8Array): string {
    const aes = managedNonce(gcm)(key);

    const cipherText = aes.encrypt(data);
    return Buffer.from(cipherText).toString('base64');
  }

  decrypt(key: Uint8Array, cipherText: Uint8Array): Uint8Array {
    const aes = managedNonce(gcm)(key);
    const rawData = aes.decrypt(cipherText);

    return rawData;
  }

  deriveEncKey(password: string): Uint8Array {
    const seed = sha256(password);
    const key = hkdf(
      sha256,
      seed,
      undefined,
      this.#HKDF_ENCRYPTION_KEY_INFO,
      32,
    );
    return key;
  }

  deriveAuthKeyPair(password: string): KeyPair {
    const seed = sha256(password);
    const k = hkdf(sha256, seed, undefined, this.#HKDF_AUTH_KEY_INFO, 32); // Derive 256 bit key.

    // Converting from bytes to scalar like this is OK because statistical
    // distance between U(2^256) % secp256k1.n and U(secp256k1.n) is negligible.
    const sk = bytesToNumberBE(k) % secp256k1.CURVE.n;
    const pk = secp256k1.getPublicKey(sk, false);
    return { sk, pk };
  }
}
