import { Password, Srp } from './secrets';
import { createWallet } from './wallet-factory';

// Unlike the unit test alongside it, this does NOT mock `@metamask/wallet`, so
// it covers what the mocked test can't: that `buildInstanceOptions` produces a
// working real `Wallet`. Safe to run offline — neither `Wallet` construction
// nor `wallet.init()` reaches the network: RemoteFeatureFlagController only
// fetches in `updateRemoteFeatureFlags`, and NetworkController's `init()` is
// synchronous and does not call `lookupNetwork`.

const TEST_SRP = 'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

describe('createWallet (real Wallet, in-memory)', () => {
  it('constructs an unlocked wallet on first run and dispatches messenger actions', async () => {
    const { wallet, dispose } = await createWallet({
      databasePath: ':memory:',
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_SRP),
      infuraProjectId: 'test-infura-id',
      log: () => undefined,
    });

    try {
      expect(wallet.state.KeyringController?.isUnlocked).toBe(true);

      // `getState` resolves synchronously; awaiting a non-thenable trips
      // `@typescript-eslint/await-thenable`.
      const { keyrings } = wallet.messenger.call('KeyringController:getState');
      expect(keyrings[0]?.accounts[0]).toMatch(/^0x[0-9a-fA-F]{40}$/u);
    } finally {
      await dispose();
    }
  }, 30_000);
});
