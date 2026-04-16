import { RpcEndpointType } from '@metamask/network-controller';
import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import { enableNetConnect } from 'nock';

import { importSecretRecoveryPhrase, sendTransaction } from './utilities';
import { Wallet } from './Wallet';
import { startAnvil } from '../test/anvil';
import type { AnvilInstance } from '../test/anvil';

const TEST_PHRASE =
  'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

async function setupWallet(): Promise<Wallet> {
  const wallet = new Wallet({
    options: {
      infuraProjectId: 'fake-infura-project-id',
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

  describe('with local chain', () => {
    let anvil: AnvilInstance;

    beforeAll(async () => {
      anvil = await startAnvil({ mnemonic: TEST_PHRASE });
    });

    afterAll(async () => {
      await anvil?.stop();
    });

    it('signs transactions', async () => {
      enableNetConnect();

      wallet = await setupWallet();

      const networkConfig = wallet.messenger.call(
        'NetworkController:addNetwork',
        {
          chainId: '0x7a69',
          name: 'Anvil',
          nativeCurrency: 'ETH',
          blockExplorerUrls: [],
          defaultRpcEndpointIndex: 0,
          rpcEndpoints: [
            {
              type: RpcEndpointType.Custom,
              url: anvil.rpcUrl,
            },
          ],
        },
      );

      const { networkClientId } = networkConfig.rpcEndpoints[0];

      const addresses = wallet.messenger
        .call('AccountsController:listAccounts')
        .map((account) => account.address);

      const { result, transactionMeta } = await sendTransaction(
        wallet,
        { from: addresses[0], to: addresses[0], data: '0x00' },
        { networkClientId },
      );

      // Advance timers by an arbitrary value to trigger downstream timer logic.
      const hash = await jest
        .advanceTimersByTimeAsync(60_000)
        .then(() => result);

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
    }, 15_000);
  });

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
