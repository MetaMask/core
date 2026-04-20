import { RpcEndpointType } from '@metamask/network-controller';
import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import { TransactionController } from '@metamask/transaction-controller';
import { enableNetConnect } from 'nock';

import { startAnvil } from '../test/anvil';
import type { AnvilInstance } from '../test/anvil';
import * as initializationModule from './initialization';
import {
  createSecretRecoveryPhrase,
  importSecretRecoveryPhrase,
  sendTransaction,
} from './utilities';
import { Wallet } from './Wallet';

const TEST_PHRASE =
  'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

async function setupWallet(): Promise<Wallet> {
  const wallet = new Wallet({
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

  it('can create secret recovery phrase', async () => {
    wallet = new Wallet({
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
    });

    await createSecretRecoveryPhrase(wallet, TEST_PASSWORD);

    expect(
      wallet.messenger.call('AccountsController:listAccounts'),
    ).toHaveLength(1);
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

  describe('lifecycle', () => {
    const options = {
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
    };

    it('exposes controllerMetadata for each initialized controller', () => {
      wallet = new Wallet(options);

      const names = Object.keys(wallet.controllerMetadata);
      expect(names).toStrictEqual(Object.keys(wallet.state));
      for (const name of names) {
        expect(wallet.controllerMetadata[name]).toBeDefined();
      }
    });

    it('omits instances without a metadata property from controllerMetadata', () => {
      const fakeMetadata = { foo: { persist: true, anonymous: false } };
      jest.spyOn(initializationModule, 'initialize').mockReturnValueOnce({
        WithMeta: { state: {}, metadata: fakeMetadata },
        NoMeta: { state: {} },
      } as never);

      wallet = new Wallet(options);

      expect(wallet.controllerMetadata).toStrictEqual({
        WithMeta: fakeMetadata,
      });
      expect(Object.keys(wallet.state)).toStrictEqual(['WithMeta', 'NoMeta']);
    });

    it('publishes Root:walletDestroyed exactly once on destroy', async () => {
      wallet = new Wallet(options);

      const listener = jest.fn();
      wallet.messenger.subscribe('Root:walletDestroyed', listener);

      await wallet.destroy();
      await wallet.destroy();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('publishes Root:walletDestroyed even if a controller destroy throws synchronously', async () => {
      wallet = new Wallet(options);

      jest
        .spyOn(TransactionController.prototype, 'destroy')
        .mockImplementation(() => {
          throw new Error('sync destroy error');
        });

      const listener = jest.fn();
      wallet.messenger.subscribe('Root:walletDestroyed', listener);

      await wallet.destroy();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('publishes Root:walletDestroyed even if a controller destroy rejects', async () => {
      wallet = new Wallet(options);

      jest
        .spyOn(TransactionController.prototype, 'destroy')
        .mockRejectedValue(new Error('async destroy error') as never);

      const listener = jest.fn();
      wallet.messenger.subscribe('Root:walletDestroyed', listener);

      await wallet.destroy();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
