import { bytesToBase64 } from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';

import {
  DATA_ENCRYPTION_SEED_ITEM_ID,
  DATA_ENCRYPTION_SEED_LENGTH,
  deriveDataKeys,
  generateDataEncryptionSeed,
  isDataEncryptionSeedItem,
} from './data-encryption.js';

describe('data-encryption', () => {
  const SEED = new Uint8Array(DATA_ENCRYPTION_SEED_LENGTH).fill(7);

  describe('generateDataEncryptionSeed', () => {
    it('should generate a seed of the expected length', () => {
      expect(generateDataEncryptionSeed()).toHaveLength(
        DATA_ENCRYPTION_SEED_LENGTH,
      );
    });

    it('should generate a different seed on each call', () => {
      expect(bytesToBase64(generateDataEncryptionSeed())).not.toBe(
        bytesToBase64(generateDataEncryptionSeed()),
      );
    });
  });

  describe('deriveDataKeys', () => {
    it('should derive the same keys from the same seed', async () => {
      const first = await deriveDataKeys(SEED);
      const second = await deriveDataKeys(SEED);

      expect(bytesToBase64(first.dataEncryptionKey)).toBe(
        bytesToBase64(second.dataEncryptionKey),
      );
      expect(first.dataAuthKeyPair.sk).toBe(second.dataAuthKeyPair.sk);
      expect(bytesToBase64(first.dataAuthKeyPair.pk)).toBe(
        bytesToBase64(second.dataAuthKeyPair.pk),
      );
    });

    it('should derive different keys from different seeds', async () => {
      const other = await deriveDataKeys(
        new Uint8Array(DATA_ENCRYPTION_SEED_LENGTH).fill(8),
      );
      const derived = await deriveDataKeys(SEED);

      expect(bytesToBase64(derived.dataEncryptionKey)).not.toBe(
        bytesToBase64(other.dataEncryptionKey),
      );
      expect(derived.dataAuthKeyPair.sk).not.toBe(other.dataAuthKeyPair.sk);
    });

    it('should derive a 256-bit data encryption key', async () => {
      expect((await deriveDataKeys(SEED)).dataEncryptionKey).toHaveLength(32);
    });

    it('should derive an auth key pair whose public key matches its secret key', async () => {
      const { dataAuthKeyPair } = await deriveDataKeys(SEED);

      expect(dataAuthKeyPair.sk).toBeGreaterThan(0n);
      expect(dataAuthKeyPair.sk).toBeLessThan(secp256k1.CURVE.n);
      expect(bytesToBase64(dataAuthKeyPair.pk)).toBe(
        bytesToBase64(secp256k1.getPublicKey(dataAuthKeyPair.sk, false)),
      );
    });

    it('should not reuse the same key material for the encryption key and the auth key pair', async () => {
      const { dataEncryptionKey, dataAuthKeyPair } = await deriveDataKeys(SEED);

      expect(dataAuthKeyPair.sk.toString(16).padStart(64, '0')).not.toBe(
        Buffer.from(dataEncryptionKey).toString('hex'),
      );
    });
  });

  describe('isDataEncryptionSeedItem', () => {
    it('should return true for the data encryption seed item', () => {
      expect(
        isDataEncryptionSeedItem({
          itemId: DATA_ENCRYPTION_SEED_ITEM_ID,
        }),
      ).toBe(true);
    });

    it('should return false for other items', () => {
      expect(isDataEncryptionSeedItem({ itemId: 'srp-1' })).toBe(false);
      expect(isDataEncryptionSeedItem({ itemId: 'PW_BACKUP' })).toBe(false);
      expect(isDataEncryptionSeedItem({ itemId: null })).toBe(false);
      expect(isDataEncryptionSeedItem({})).toBe(false);
    });
  });
});
