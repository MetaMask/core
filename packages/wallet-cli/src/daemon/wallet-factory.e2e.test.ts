import { createWallet } from './wallet-factory';

// This suite deliberately does NOT mock `@metamask/wallet` (unlike the unit
// test alongside it). It feeds the real `buildInstanceOptions` into a real
// `Wallet` against an in-memory database, closing the gap that the mocked unit
// test cannot reach: that the wired `instanceOptions` actually construct a
// working wallet. Constructing a `Wallet` never triggers the
// RemoteFeatureFlagController's network fetch (that only happens on an explicit
// `updateRemoteFeatureFlags` call), so this stays offline and CI-safe.

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
      // First-run SRP import unlocks the keyring — proof the real wallet built
      // from `buildInstanceOptions` is functional, not just constructed.
      expect(wallet.state.KeyringController?.isUnlocked).toBe(true);

      // Dispatch through the messenger exactly as the daemon's `call` handler
      // does, to prove the wired controllers respond. `listAccounts` resolves
      // synchronously, so it is not awaited.
      const accounts = wallet.messenger.call('AccountsController:listAccounts');
      expect(accounts).toHaveLength(1);
    } finally {
      await dispose();
    }
  }, 30_000);
});
