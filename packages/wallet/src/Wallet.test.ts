import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import { cleanAll, enableNetConnect } from 'nock';

import { importSecretRecoveryPhrase, sendTransaction } from './utilities';
import { Wallet } from './Wallet';

const TEST_PHRASE =
  'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

async function setupWallet(): Promise<Wallet> {
  if (!process.env.INFURA_PROJECT_KEY) {
    throw new Error(
      'INFURA_PROJECT_KEY is not set. Copy .env.example to .env and fill in your key.',
    );
  }

  const wallet = new Wallet({
    options: {
      infuraProjectId: process.env.INFURA_PROJECT_KEY,
      clientVersion: '1.0.0',
      showApprovalRequest: (): undefined => undefined,
      clientConfigApiService: new ClientConfigApiService({
        fetch: globalThis.fetch,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      }),
      getMetaMetricsId: (): string => 'fake-metrics-id',
    },
  });

  await importSecretRecoveryPhrase(wallet, TEST_PASSWORD, TEST_PHRASE);

  return wallet;
}

describe('Wallet', () => {
  let wallet: Wallet;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(async () => {
    await wallet?.destroy();
    cleanAll();
    enableNetConnect();
    jest.useRealTimers();
  });

  it('can unlock and populate accounts', async () => {
    wallet = await setupWallet();
    const { messenger } = wallet;

    expect(
      messenger
        .call('AccountsController:listAccounts')
        .map((account) => account.address),
    ).toStrictEqual(['0xc6d5a3c98ec9073b54fa0969957bd582e8d874bf']);
  });

  it('signs transactions', async () => {
    enableNetConnect();

    wallet = await setupWallet();

    const addresses = wallet.messenger
      .call('AccountsController:listAccounts')
      .map((account) => account.address);

    const { result, transactionMeta } = await sendTransaction(
      wallet,
      { from: addresses[0], to: addresses[0], data: '0x00' },
      { networkClientId: 'sepolia' },
    );

    const hash = await jest.advanceTimersByTimeAsync(60_000).then(() => result);

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
  }, 30_000);

  it('exposes state', async () => {
    wallet = await setupWallet();
    const { state } = wallet;

    expect(state.KeyringController).toStrictEqual({
      isUnlocked: true,
      keyrings: expect.any(Array),
      encryptionKey: expect.any(String),
      encryptionSalt: expect.any(String),
      vault: expect.any(String),
    });
  });
});
