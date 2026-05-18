import { KeyringController } from '@metamask/keyring-controller';

import * as initializationModule from './initialization';
import { importSecretRecoveryPhrase } from './utilities';
import { Wallet } from './Wallet';

const TEST_SRP = 'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

async function setupWallet(): Promise<Wallet> {
  const wallet = new Wallet({});

  await importSecretRecoveryPhrase(wallet, TEST_PASSWORD, TEST_SRP);

  return wallet;
}

describe('Wallet', () => {
  it('exposes state', async () => {
    const wallet = await setupWallet();
    const { state } = wallet;

    expect(state.KeyringController).toStrictEqual({
      isUnlocked: true,
      keyrings: expect.any(Array),
      encryptionKey: expect.any(String),
      encryptionSalt: expect.any(String),
      vault: expect.any(String),
    });
  });

  describe('lifecycle', () => {
    it('exposes controllerMetadata for each initialized controller', async () => {
      const wallet = await setupWallet();

      const names = Object.keys(wallet.controllerMetadata);
      expect(names).toStrictEqual(Object.keys(wallet.state));
      for (const name of names) {
        expect(wallet.controllerMetadata[name]).toBeDefined();
      }
    });

    it('omits instances without a metadata property from controllerMetadata', async () => {
      const fakeMetadata = {
        foo: { persist: true, includeInDebugSnapshot: false },
      };
      jest.spyOn(initializationModule, 'initialize').mockReturnValueOnce({
        WithMeta: { state: {}, metadata: fakeMetadata },
        NoMeta: { state: {} },
      } as never);

      const wallet = new Wallet({});

      expect(wallet.controllerMetadata).toStrictEqual({
        WithMeta: fakeMetadata,
      });
      expect(Object.keys(wallet.state)).toStrictEqual(['WithMeta', 'NoMeta']);
    });

    it('publishes Wallet:destroyed exactly once on destroy', async () => {
      const wallet = await setupWallet();

      const listener = jest.fn();
      wallet.messenger.subscribe('Wallet:destroyed', listener);

      await wallet.destroy();
      await wallet.destroy();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('publishes Wallet:destroyed even if a controller destroy throws synchronously', async () => {
      const wallet = await setupWallet();

      jest
        .spyOn(KeyringController.prototype, 'destroy')
        .mockImplementation(() => {
          throw new Error('sync destroy error');
        });

      const listener = jest.fn();
      wallet.messenger.subscribe('Wallet:destroyed', listener);

      await wallet.destroy();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('publishes Wallet:destroyed even if a controller destroy rejects', async () => {
      const wallet = await setupWallet();

      jest
        .spyOn(KeyringController.prototype, 'destroy')
        .mockRejectedValue(new Error('async destroy error') as never);

      const listener = jest.fn();
      wallet.messenger.subscribe('Wallet:destroyed', listener);

      await wallet.destroy();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
