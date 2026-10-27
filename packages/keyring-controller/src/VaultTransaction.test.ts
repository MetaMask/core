import type { Keyring as KeyringV2 } from '@metamask/keyring-api/v2';
import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Hex, Json } from '@metamask/utils';

import type { KeyringEntry } from './KeyringController.js';
import { VaultTransaction } from './VaultTransaction.js';

type FakeKeyringOptions = {
  destroy?: () => Promise<void>;
};

const buildFakeKeyring = ({
  destroy,
}: FakeKeyringOptions = {}): EthKeyring => ({
  type: 'Fake Keyring',
  ...(destroy ? { destroy } : {}),
  serialize: async (): Promise<Json> => ({}),
  deserialize: async (): Promise<void> => undefined,
  getAccounts: async (): Promise<Hex[]> => [],
  addAccounts: async (): Promise<Hex[]> => [],
});

const buildFakeKeyringV2 = ({
  destroy,
}: FakeKeyringOptions = {}): KeyringV2 => ({
  type: 'hd',
  capabilities: { scopes: ['eip155:1'] },
  ...(destroy ? { destroy } : {}),
  serialize: async (): Promise<Json> => ({}),
  deserialize: async (): Promise<void> => undefined,
  getAccounts: async () => [],
  getAccount: async () => {
    throw new Error('Not implemented');
  },
  createAccounts: async () => [],
  deleteAccount: async (): Promise<void> => undefined,
  submitRequest: async (): Promise<Json> => ({}),
});

const buildEntry = (
  keyring: EthKeyring,
  keyringV2?: KeyringV2,
): KeyringEntry => ({
  keyring,
  ...(keyringV2 ? { keyringV2 } : {}),
  metadata: { id: 'keyring-id', name: 'Keyring' },
});

describe('VaultTransaction', () => {
  describe('scope', () => {
    it('exposes the wallet scope', () => {
      const transaction = new VaultTransaction({ type: 'wallet' });

      expect(transaction.scope).toStrictEqual({ type: 'wallet' });
    });

    it('exposes the keyring scope with its entry and created flag', () => {
      const entry = buildEntry(buildFakeKeyring());
      const transaction = new VaultTransaction({
        type: 'keyring',
        entry,
        created: false,
      });

      expect(transaction.scope).toStrictEqual({
        type: 'keyring',
        entry,
        created: false,
      });
    });
  });

  describe('destroy', () => {
    it('destroys the keyring and its V2 instance', async () => {
      const keyringDestroy = jest.fn(async () => undefined);
      const keyringV2Destroy = jest.fn(async () => undefined);
      const entry = buildEntry(
        buildFakeKeyring({ destroy: keyringDestroy }),
        buildFakeKeyringV2({ destroy: keyringV2Destroy }),
      );
      const transaction = new VaultTransaction({ type: 'wallet' });

      await transaction.destroy(entry);

      expect(keyringDestroy).toHaveBeenCalledTimes(1);
      expect(keyringV2Destroy).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for keyrings without a destroy method', async () => {
      const keyring = buildFakeKeyring();
      const entry = buildEntry(keyring);
      const transaction = new VaultTransaction({ type: 'wallet' });

      expect(await transaction.destroy(entry)).toBeUndefined();
      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('marks the entry as destroyed', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const transaction = new VaultTransaction({ type: 'wallet' });

      await transaction.destroy(entry);

      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('marks the entry as destroyed even when destruction throws', async () => {
      const entry = buildEntry(
        buildFakeKeyring({
          destroy: async () => {
            throw new Error('destroy failed');
          },
        }),
      );
      const transaction = new VaultTransaction({ type: 'wallet' });

      await expect(transaction.destroy(entry)).rejects.toThrow(
        'destroy failed',
      );
      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('marks the entry as destroyed when the V1 destruction succeeds but the V2 one throws', async () => {
      const keyringDestroy = jest.fn(async () => undefined);
      const entry = buildEntry(
        buildFakeKeyring({ destroy: keyringDestroy }),
        buildFakeKeyringV2({
          destroy: async () => {
            throw new Error('destroy failed');
          },
        }),
      );
      const transaction = new VaultTransaction({ type: 'wallet' });

      await expect(transaction.destroy(entry)).rejects.toThrow(
        'destroy failed',
      );
      expect(keyringDestroy).toHaveBeenCalledTimes(1);
      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('propagates destruction errors', async () => {
      const destroy = jest.fn(async () => {
        throw new Error('destroy failed');
      });
      const entry = buildEntry(buildFakeKeyring({ destroy }));
      const transaction = new VaultTransaction({ type: 'wallet' });

      await expect(transaction.destroy(entry)).rejects.toThrow(
        'destroy failed',
      );
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('logs instead of throwing when errors are ignored', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const destroy = jest.fn(async () => {
        throw new Error('destroy failed');
      });
      const entry = buildEntry(buildFakeKeyring({ destroy }));
      const transaction = new VaultTransaction({ type: 'wallet' });

      expect(
        await transaction.destroy(entry, { ignoreErrors: true }),
      ).toBeUndefined();
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    it('marks the entry as destroyed when destruction throws and errors are ignored', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const entry = buildEntry(
        buildFakeKeyring({
          destroy: async () => {
            throw new Error('destroy failed');
          },
        }),
      );
      const transaction = new VaultTransaction({ type: 'wallet' });

      await transaction.destroy(entry, { ignoreErrors: true });

      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('does not mark entries it did not destroy', async () => {
      const destroyedEntry = buildEntry(buildFakeKeyring());
      const untouchedEntry = buildEntry(buildFakeKeyring());
      const transaction = new VaultTransaction({ type: 'wallet' });

      await transaction.destroy(destroyedEntry);

      expect(transaction.isDestroyed(untouchedEntry)).toBe(false);
    });
  });

  describe('isDestroyed', () => {
    it('returns false for untouched entries', () => {
      const entry = buildEntry(buildFakeKeyring());
      const transaction = new VaultTransaction({ type: 'wallet' });

      expect(transaction.isDestroyed(entry)).toBe(false);
    });

    it('tracks destroyed entries per transaction instance', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const firstTransaction = new VaultTransaction({ type: 'wallet' });
      const secondTransaction = new VaultTransaction({ type: 'wallet' });

      await firstTransaction.destroy(entry);

      expect(firstTransaction.isDestroyed(entry)).toBe(true);
      expect(secondTransaction.isDestroyed(entry)).toBe(false);
    });
  });
});
