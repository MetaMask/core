import { webcrypto } from 'node:crypto';

import {
  prepareCreationParams,
  buildPasskeyRecord,
  prepareAssertionParams,
  unwrapEncryptionKeyFromAssertion,
} from './orchestration';
import type { CredentialCreationResult, AssertionResult } from './types';

describe('orchestration', () => {
  describe('prepareCreationParams', () => {
    it('returns 64-byte userHandle and 32-byte prfSalt', () => {
      const params = prepareCreationParams();
      expect(params.userHandle).toBeInstanceOf(Uint8Array);
      expect(params.userHandle.byteLength).toBe(64);
      expect(params.prfSalt).toBeInstanceOf(Uint8Array);
      expect(params.prfSalt.byteLength).toBe(32);
    });

    it('returns different values on each call', () => {
      const a = prepareCreationParams();
      const b = prepareCreationParams();
      expect(Buffer.from(a.userHandle)).not.toStrictEqual(
        Buffer.from(b.userHandle),
      );
    });
  });

  describe('buildPasskeyRecord + unwrapEncryptionKeyFromAssertion (round-trip)', () => {
    const vaultEncryptionKey =
      'eyJhbGciOiJBMjU2R0NNIiwidHlwIjoiSldFIn0.mock-vault-key-serialized';
    const vaultSalt = 'someSaltValue123';

    it('round-trips via userHandle path', async () => {
      const params = prepareCreationParams();
      const ceremonyResult: CredentialCreationResult = {
        credentialId: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        userHandle: params.userHandle,
        prfEnabled: false,
      };

      const record = await buildPasskeyRecord(
        vaultEncryptionKey,
        vaultSalt,
        ceremonyResult,
        params.prfSalt,
      );

      expect(record.derivationMethod).toBe('userHandle');
      expect(record.wrappedEncryptionKey.length).toBeGreaterThan(0);
      expect(record.iv.length).toBeGreaterThan(0);
      expect(record.encryptionSalt).toBe(vaultSalt);
      expect(record.prfSalt).toBeUndefined();

      const assertionResult: AssertionResult = {
        userHandle: params.userHandle.buffer,
      };

      const unwrapped = await unwrapEncryptionKeyFromAssertion(
        record,
        assertionResult,
      );
      expect(unwrapped).toBe(vaultEncryptionKey);
    });

    it('round-trips via PRF path when prfEnabled is false but prfFirst is present', async () => {
      const params = prepareCreationParams();
      const prfOutput = webcrypto.getRandomValues(new Uint8Array(32));

      const ceremonyResult: CredentialCreationResult = {
        credentialId: new Uint8Array([10, 20, 30, 40]),
        userHandle: params.userHandle,
        prfEnabled: false,
        prfFirst: prfOutput.buffer,
      };

      const record = await buildPasskeyRecord(
        vaultEncryptionKey,
        vaultSalt,
        ceremonyResult,
        params.prfSalt,
      );

      expect(record.derivationMethod).toBe('prf');
      expect(record.prfSalt).toBeDefined();

      const assertionResult: AssertionResult = {
        prfFirst: prfOutput.buffer,
      };

      const unwrapped = await unwrapEncryptionKeyFromAssertion(
        record,
        assertionResult,
      );
      expect(unwrapped).toBe(vaultEncryptionKey);
    });

    it('round-trips via PRF path', async () => {
      const params = prepareCreationParams();
      const prfOutput = webcrypto.getRandomValues(new Uint8Array(32));

      const ceremonyResult: CredentialCreationResult = {
        credentialId: new Uint8Array([10, 20, 30, 40]),
        userHandle: params.userHandle,
        prfEnabled: true,
        prfFirst: prfOutput.buffer,
      };

      const record = await buildPasskeyRecord(
        vaultEncryptionKey,
        vaultSalt,
        ceremonyResult,
        params.prfSalt,
      );

      expect(record.derivationMethod).toBe('prf');
      expect(record.prfSalt).toBeDefined();
      expect(record.prfSalt?.length).toBeGreaterThan(0);
      expect(record.encryptionSalt).toBe(vaultSalt);

      const assertionResult: AssertionResult = {
        prfFirst: prfOutput.buffer,
      };

      const unwrapped = await unwrapEncryptionKeyFromAssertion(
        record,
        assertionResult,
      );
      expect(unwrapped).toBe(vaultEncryptionKey);
    });

    it('throws when assertion is missing key material', async () => {
      const params = prepareCreationParams();
      const ceremonyResult: CredentialCreationResult = {
        credentialId: new Uint8Array([1, 2, 3]),
        userHandle: params.userHandle,
        prfEnabled: false,
      };

      const record = await buildPasskeyRecord(
        vaultEncryptionKey,
        vaultSalt,
        ceremonyResult,
        params.prfSalt,
      );

      const emptyAssertion: AssertionResult = {};

      await expect(
        unwrapEncryptionKeyFromAssertion(record, emptyAssertion),
      ).rejects.toThrow('Passkey assertion missing required key material');
    });
  });

  describe('prepareAssertionParams', () => {
    it('extracts params for userHandle record', async () => {
      const params = prepareCreationParams();
      const ceremonyResult: CredentialCreationResult = {
        credentialId: new Uint8Array([5, 6, 7]),
        userHandle: params.userHandle,
        prfEnabled: false,
      };

      const record = await buildPasskeyRecord(
        'test-key',
        'test-salt',
        ceremonyResult,
        params.prfSalt,
      );

      const assertionParams = prepareAssertionParams(record);
      expect(assertionParams.credentialId).toBeInstanceOf(Uint8Array);
      expect(assertionParams.usePrf).toBe(false);
      expect(assertionParams.prfSalt).toBeUndefined();
    });

    it('extracts params for PRF record', async () => {
      const params = prepareCreationParams();
      const prfOutput = webcrypto.getRandomValues(new Uint8Array(32));

      const ceremonyResult: CredentialCreationResult = {
        credentialId: new Uint8Array([8, 9, 10]),
        userHandle: params.userHandle,
        prfEnabled: true,
        prfFirst: prfOutput.buffer,
      };

      const record = await buildPasskeyRecord(
        'test-key',
        'test-salt',
        ceremonyResult,
        params.prfSalt,
      );

      const assertionParams = prepareAssertionParams(record);
      expect(assertionParams.usePrf).toBe(true);
      expect(assertionParams.prfSalt).toBeInstanceOf(Uint8Array);
      expect(assertionParams.prfSalt?.byteLength).toBe(32);
    });
  });
});
