import { createWallet } from './wallet-factory';

// Unlike the unit test alongside it, this does NOT mock `@metamask/wallet`, so
// it covers what the mocked test can't: that `buildInstanceOptions` produces a
// working real `Wallet`. Safe to run offline — `Wallet` construction never
// triggers RemoteFeatureFlagController's fetch (only `updateRemoteFeatureFlags`
// does).

const TEST_SRP = 'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

describe('createWallet (real Wallet, in-memory)', () => {
  it('constructs an unlocked wallet on first run and dispatches messenger actions', async () => {
    const { wallet, dispose } = await createWallet({
      databasePath: ':memory:',
      password: TEST_PASSWORD,
      srp: TEST_SRP,
      log: () => undefined,
    });

    try {
      expect(wallet.state.KeyringController?.isUnlocked).toBe(true);

      // `listAccounts` resolves synchronously; awaiting a non-thenable trips
      // `@typescript-eslint/await-thenable`.
      const accounts = wallet.messenger.call('AccountsController:listAccounts');
      expect(accounts).toHaveLength(1);
    } finally {
      await dispose();
    }
  }, 30_000);
});
