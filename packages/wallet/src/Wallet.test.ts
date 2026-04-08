import { importSecretRecoveryPhrase } from './utilities';
import { Wallet } from './Wallet';

const TEST_PHRASE =
  'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

describe('Wallet', () => {
  it('can unlock and populate accounts', async () => {
    const wallet = new Wallet();

    await importSecretRecoveryPhrase(wallet, TEST_PASSWORD, TEST_PHRASE);

    const { messenger } = wallet;

    expect(
      messenger
        .call('AccountsController:listAccounts')
        .map((account) => account.address),
    ).toStrictEqual(['0xc6d5a3c98ec9073b54fa0969957bd582e8d874bf']);
  });

  it('exposes state', () => {
    const { state } = new Wallet();

    expect(state.KeyringController).toStrictEqual({
      isUnlocked: false,
      keyrings: [],
    });
  });
});
