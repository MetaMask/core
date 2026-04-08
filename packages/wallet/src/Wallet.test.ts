import { enableNetConnect } from 'nock';

import { importSecretRecoveryPhrase, sendTransaction } from './utilities';
import { Wallet } from './Wallet';

const TEST_PHRASE =
  'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

async function setupWallet() {
  const wallet = new Wallet({
    options: {
      infuraProjectId: 'infura-project-id',
      clientVersion: '1.0.0',
      showApprovalRequest: () => undefined,
    },
  });

  await importSecretRecoveryPhrase(wallet, TEST_PASSWORD, TEST_PHRASE);

  return wallet;
}

describe('Wallet', () => {
  it('can unlock and populate accounts', async () => {
    const { messenger } = await setupWallet();

    expect(
      messenger
        .call('AccountsController:listAccounts')
        .map((account) => account.address),
    ).toStrictEqual(['0xc6d5a3c98ec9073b54fa0969957bd582e8d874bf']);
  });

  it('signs transactions', async () => {
    enableNetConnect();

    const wallet = await setupWallet();

    const addresses = wallet.messenger
      .call('AccountsController:listAccounts')
      .map((account) => account.address);

    const { result, transactionMeta } = await sendTransaction(
      wallet,
      { from: addresses[0], to: addresses[0], data: '0x00' },
      { networkClientId: 'sepolia' },
    );

    const hash = await result;

    expect(hash).toStrictEqual(expect.any(String));
    expect(transactionMeta).toStrictEqual(
      expect.objectContaining({
        txParams: expect.objectContaining({
          from: addresses[0],
          to: addresses[0],
          data: '0x00',
          value: '0x0',
          type: '0x2',
        }),
      }),
    );
  });

  it('exposes state', async () => {
    const { state } = await setupWallet();

    expect(state.KeyringController).toStrictEqual({
      isUnlocked: true,
      keyrings: expect.any(Array),
      encryptionKey: expect.any(String),
      encryptionSalt: expect.any(String),
      vault: expect.any(String),
    });
  });
});
