import { decrypt, encryptWithDetail, isVaultUpdated } from '@metamask/browser-passworder';

import { encryptorFactory } from './keyring-controller';

const PASSWORD = 'test-password';
const DATA = { foo: 'bar' };
// Use a low iteration count so tests run quickly; we are testing wiring, not
// cryptographic strength.
const ITERATIONS = 1_000;

describe('encryptorFactory', () => {
  describe('encrypt', () => {
    it('produces ciphertext that decrypts back to the original data', async () => {
      const { encrypt } = encryptorFactory(ITERATIONS);
      const ciphertext = await encrypt(PASSWORD, DATA);
      expect(await decrypt(PASSWORD, ciphertext)).toStrictEqual(DATA);
    });

    it('embeds the specified PBKDF2 iteration count', async () => {
      const { encrypt } = encryptorFactory(ITERATIONS);
      const ciphertext = await encrypt(PASSWORD, DATA);
      expect(
        isVaultUpdated(ciphertext, {
          algorithm: 'PBKDF2',
          params: { iterations: ITERATIONS },
        }),
      ).toBe(true);
    });
  });

  describe('encryptWithDetail', () => {
    it('returns a vault that decrypts back to the original data', async () => {
      const { encryptWithDetail: encryptWithDetailFn } =
        encryptorFactory(ITERATIONS);
      const { vault } = await encryptWithDetailFn(PASSWORD, DATA);
      expect(await decrypt(PASSWORD, vault)).toStrictEqual(DATA);
    });

    it('embeds the specified PBKDF2 iteration count in the vault', async () => {
      const { encryptWithDetail: encryptWithDetailFn } =
        encryptorFactory(ITERATIONS);
      const { vault } = await encryptWithDetailFn(PASSWORD, DATA);
      expect(
        isVaultUpdated(vault, {
          algorithm: 'PBKDF2',
          params: { iterations: ITERATIONS },
        }),
      ).toBe(true);
    });
  });

  describe('isVaultUpdated', () => {
    it('returns true for a vault encrypted with the matching iteration count', async () => {
      const { vault } = await encryptWithDetail(PASSWORD, DATA, undefined, {
        algorithm: 'PBKDF2',
        params: { iterations: ITERATIONS },
      });
      expect(encryptorFactory(ITERATIONS).isVaultUpdated(vault)).toBe(true);
    });

    it('returns false for a vault encrypted with a different iteration count', async () => {
      const { vault } = await encryptWithDetail(PASSWORD, DATA, undefined, {
        algorithm: 'PBKDF2',
        params: { iterations: ITERATIONS - 1 },
      });
      expect(encryptorFactory(ITERATIONS).isVaultUpdated(vault)).toBe(false);
    });
  });
});
