import { getDefaultAddressBookControllerState } from '@metamask/address-book-controller';
import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import { Messenger } from '@metamask/messenger';
import { InMemoryStorageAdapter } from '@metamask/storage-service';
import { Json } from '@metamask/utils';
import { webcrypto } from 'crypto';

import MockEncryptor from '../../keyring-controller/tests/mocks/mockEncryptor.js';
import * as initializationModule from './initialization/initialization.js';
import { AlwaysOnlineAdapter } from './initialization/instances/connectivity-controller/always-online-adapter.js';
import { importSecretRecoveryPhrase } from './utilities.js';
import { Wallet } from './Wallet.js';

const TEST_SRP = 'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';

const REMOTE_FEATURE_FLAG_OPTIONS = {
  clientConfigApiService: {
    fetchRemoteFeatureFlags: async (): Promise<{
      remoteFeatureFlags: Record<string, boolean>;
      cacheTimestamp: number;
    }> => ({ remoteFeatureFlags: {}, cacheTimestamp: Date.now() }),
  },
};

async function setupWallet(): Promise<Wallet> {
  const wallet = new Wallet({
    instanceOptions: {
      connectivityController: {
        connectivityAdapter: new AlwaysOnlineAdapter(),
      },
      gasFeeController: {
        clientId: 'test',
      },
      networkController: {
        analyticsOptions: {
          isRpcEndpointUrlPublic: (): boolean => false,
          rpcServiceEventsSampleRate: 0,
        },
        infuraProjectId: 'fake-infura-project-id',
      },
      storageService: {
        storage: new InMemoryStorageAdapter(),
      },
      remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
    },
  });

  await importSecretRecoveryPhrase(wallet, TEST_PASSWORD, TEST_SRP);

  return wallet;
}

describe('Wallet', () => {
  beforeAll(() => {
    // We can remove this once we drop Node 18
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    globalThis.crypto ??= webcrypto as typeof globalThis.crypto;

    // eslint-disable-next-line no-restricted-syntax
    if (!('CryptoKey' in globalThis)) {
      Object.defineProperty(globalThis, 'CryptoKey', {
        value: webcrypto.CryptoKey,
      });
    }
  });

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

  it('exposes instances', async () => {
    const wallet = await setupWallet();

    expect(wallet.getInstance('KeyringController').state).toStrictEqual({
      isUnlocked: true,
      keyrings: expect.any(Array),
      encryptionKey: expect.any(String),
      encryptionSalt: expect.any(String),
      vault: expect.any(String),
    });
  });

  it('supports passing instance options', async () => {
    const wallet = new Wallet({
      instanceOptions: {
        connectivityController: {
          connectivityAdapter: new AlwaysOnlineAdapter(),
        },
        gasFeeController: {
          clientId: 'test',
        },
        keyringController: {
          encryptor: new MockEncryptor(),
        },
        networkController: {
          analyticsOptions: {
            isRpcEndpointUrlPublic: (): boolean => false,
            rpcServiceEventsSampleRate: 0,
          },
          infuraProjectId: 'fake-infura-project-id',
        },
        storageService: {
          storage: new InMemoryStorageAdapter(),
        },
        remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
      },
    });

    await importSecretRecoveryPhrase(wallet, TEST_PASSWORD, TEST_SRP);

    const { state } = wallet;

    const vault = JSON.parse(state.KeyringController.vault as string);

    expect(vault).toStrictEqual({
      data: expect.any(String),
      iv: 'iv',
      salt: 'salt',
    });
  });

  it('supports passing additional initialization configurations', async () => {
    class DummyController {
      state = { foo: 'bar' };
    }

    class DummyService {}

    const wallet = new Wallet({
      initializationConfigurations: [
        {
          name: 'KeyringController',
          getMessenger: (): Messenger<string> =>
            new Messenger({ namespace: 'KeyringController' }),
          init: (): DummyController => new DummyController(),
        },
        {
          name: 'TestService',
          getMessenger: (): Messenger<string> =>
            new Messenger({ namespace: 'TestService' }),
          init: (): DummyService => new DummyService(),
        },
      ],
      instanceOptions: {
        connectivityController: {
          connectivityAdapter: new AlwaysOnlineAdapter(),
        },
        gasFeeController: {
          clientId: 'test',
        },
        networkController: {
          analyticsOptions: {
            isRpcEndpointUrlPublic: (): boolean => false,
            rpcServiceEventsSampleRate: 0,
          },
          infuraProjectId: 'fake-infura-project-id',
        },
        storageService: {
          storage: new InMemoryStorageAdapter(),
        },
        remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
      },
    });
    const { state } = wallet;

    expect(state.KeyringController).toStrictEqual({
      foo: 'bar',
    });

    expect((state as Record<string, Json>).TestService).toBeUndefined();
  });

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
      // @ts-expect-error Mock data.
      WithMeta: { state: {}, metadata: fakeMetadata },
      NoMeta: { state: {} },
    });

    const wallet = new Wallet({
      instanceOptions: {
        connectivityController: {
          connectivityAdapter: new AlwaysOnlineAdapter(),
        },
        gasFeeController: {
          clientId: 'test',
        },
        networkController: {
          analyticsOptions: {
            isRpcEndpointUrlPublic: (): boolean => false,
            rpcServiceEventsSampleRate: 0,
          },
          infuraProjectId: 'fake-infura-project-id',
        },
        storageService: {
          storage: new InMemoryStorageAdapter(),
        },
        remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
      },
    });

    expect(wallet.controllerMetadata).toStrictEqual({
      WithMeta: fakeMetadata,
    });
    expect(Object.keys(wallet.state)).toStrictEqual(['WithMeta', 'NoMeta']);
  });

  it('calls init on all instances and returns the results', async () => {
    const wallet = await setupWallet();

    const results = await wallet.init();

    expect(results).toHaveLength(2);
  });

  it('disallows modifying the messenger', async () => {
    const wallet = await setupWallet();

    expect(() => {
      wallet.messenger = new Messenger({ namespace: 'Root' });
    }).toThrow('The messenger cannot be directly mutated.');
  });

  it('disallows modifying the state', async () => {
    const wallet = await setupWallet();

    expect(() => {
      wallet.state = { KeyringController: { isUnlocked: false, keyrings: [] } };
    }).toThrow('Wallet state cannot be directly mutated.');
  });

  it('disallows modifying the controller metadata', async () => {
    const wallet = await setupWallet();

    expect(() => {
      wallet.controllerMetadata = {};
    }).toThrow('The controller metadata cannot be directly mutated.');
  });

  it('calls destroy on instances exactly once', async () => {
    const wallet = await setupWallet();

    const keyringController = wallet.getInstance('KeyringController');

    const spy = jest.spyOn(keyringController, 'destroy');

    await wallet.destroy();
    await wallet.destroy();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  describe('AccountsController', () => {
    it('tracks accounts created via KeyringController', async () => {
      const wallet = await setupWallet();

      const keyringAccounts = await wallet.messenger.call(
        'KeyringController:getAccounts',
      );
      const trackedAddresses = Object.values(
        wallet.state.AccountsController.internalAccounts.accounts,
      ).map((account) => account.address);

      // Sort both arrays so the assertion does not depend on account ordering.
      expect([...trackedAddresses].sort()).toStrictEqual(
        [...keyringAccounts].sort(),
      );
    });
  });

  describe('AddressBookController', () => {
    const ADDRESS = '0x1234567890123456789012345678901234567890';

    it('is wired and exposes its state on the wallet messenger', async () => {
      const wallet = await setupWallet();
      const { messenger } = wallet;

      expect(messenger.call('AddressBookController:getState')).toStrictEqual(
        getDefaultAddressBookControllerState(),
      );
    });

    it('applies initial state passed through the Wallet constructor', () => {
      const entry = {
        address: ADDRESS,
        name: 'Alice',
        chainId: '0x1' as const,
        memo: '',
        isEns: false,
      };

      const wallet = new Wallet({
        state: {
          AddressBookController: {
            addressBook: { '0x1': { [ADDRESS]: entry } },
          },
        },
        instanceOptions: {
          connectivityController: {
            connectivityAdapter: new AlwaysOnlineAdapter(),
          },
          gasFeeController: {
            clientId: 'test',
          },
          networkController: {
            analyticsOptions: {
              isRpcEndpointUrlPublic: (): boolean => false,
              rpcServiceEventsSampleRate: 0,
            },
            infuraProjectId: 'fake-infura-project-id',
          },
          storageService: {
            storage: new InMemoryStorageAdapter(),
          },
          remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
        },
      });

      expect(
        wallet.state.AddressBookController.addressBook['0x1'][ADDRESS],
      ).toStrictEqual(entry);
    });

    it('routes its method actions through the wallet messenger', async () => {
      const wallet = await setupWallet();
      const { messenger } = wallet;

      messenger.call('AddressBookController:set', ADDRESS, 'Alice');

      expect(messenger.call('AddressBookController:list')).toHaveLength(1);
    });
  });

  describe('ConnectivityController', () => {
    it('reports online connectivity status', () => {
      const wallet = new Wallet({
        instanceOptions: {
          connectivityController: {
            connectivityAdapter: new AlwaysOnlineAdapter(),
          },
          gasFeeController: {
            clientId: 'test',
          },
          networkController: {
            analyticsOptions: {
              isRpcEndpointUrlPublic: (): boolean => false,
              rpcServiceEventsSampleRate: 0,
            },
            infuraProjectId: 'fake-infura-project-id',
          },
          storageService: {
            storage: new InMemoryStorageAdapter(),
          },
          remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
        },
      });

      expect(wallet.state.ConnectivityController.connectivityStatus).toBe(
        CONNECTIVITY_STATUSES.Online,
      );
    });
  });

  describe('KeyringController', () => {
    it('can unlock and populate accounts', async () => {
      const wallet = await setupWallet();
      const { messenger } = wallet;

      expect(
        await messenger.call('KeyringController:getAccounts'),
      ).toStrictEqual(['0xc6d5a3c98ec9073b54fa0969957bd582e8d874bf']);
    });

    it('can unlock a persisted vault', async () => {
      const vault =
        '{"data":"iOD5pIcPeRZYQ4WdEMsNYoZ3xBxWBafIU8Cr4nD0X4zBvrOA06tGen3sKQ/ValasXSweLnzH9Fk2frkPYmqeJWBtTNYFwdHPe7P970ThZwreSXN1Sqrx9Ad+YzmIN0y89Yg3KrUodPWaRgIZmgWbfDon6ADPgeEDkX0/GAEYET39O7Rx/gL+rcaTpxnpHPTgHiLbhRHWGsS3z+JVomSqoLAO5XVvrJWenO6R3Nzm62BaJaSPrf/pwstZqhSvxTq8hnQf7aR81hWfwYTxNBVG7TC/dniSQ8K5So6PvUN5nzAqvtzzHT2TagOuxQkX88Zi17P8os21jNmNdA90IGYroD+b/mppyRIgRYWtAUQZH9ji36atEuFupszbg8Qw1iaL3EQyUogC30Cpj9ko5bbqhYgqmFHF0J/kflhPHKuO6d4tgSmhYpTumydQRjxaPnlghIS5YI4W+7p9HVBpb+c6IPUz9y/x3Ngbp+ukJwOnXt2U/eZhXrJzi2z1x/nzPg4fzDJoM7k=","iv":"yrZsyC7dso/q7pQ48YX3vw==","keyMetadata":{"algorithm":"PBKDF2","params":{"iterations":600000}},"salt":"s7nIrMWK1lcZVjfdmES1DBML8Uz4ja2fpm8zUz1lWI0="}';

      const wallet = new Wallet({
        state: {
          KeyringController: {
            vault,
          },
        },
        instanceOptions: {
          connectivityController: {
            connectivityAdapter: new AlwaysOnlineAdapter(),
          },
          gasFeeController: {
            clientId: 'test',
          },
          networkController: {
            analyticsOptions: {
              isRpcEndpointUrlPublic: (): boolean => false,
              rpcServiceEventsSampleRate: 0,
            },
            infuraProjectId: 'fake-infura-project-id',
          },
          storageService: {
            storage: new InMemoryStorageAdapter(),
          },
          remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
        },
      });

      await wallet.messenger.call(
        'KeyringController:submitPassword',
        TEST_PASSWORD,
      );

      expect(wallet.state.KeyringController).toStrictEqual({
        isUnlocked: true,
        keyrings: expect.any(Array),
        encryptionKey: expect.any(String),
        encryptionSalt: expect.any(String),
        vault: expect.any(String),
      });
    });

    it('can lock', async () => {
      const wallet = await setupWallet();
      const { messenger } = wallet;

      await messenger.call('KeyringController:setLocked');

      expect(wallet.state.KeyringController).toStrictEqual({
        isUnlocked: false,
        keyrings: [],
        vault: expect.any(String),
      });
    });
  });

  describe('StorageService', () => {
    it('can set and get items', async () => {
      const wallet = await setupWallet();
      const { messenger } = wallet;

      await messenger.call(
        'StorageService:setItem',
        'TestNamespace',
        'foo',
        'bar',
      );

      expect(
        (await messenger.call('StorageService:getItem', 'TestNamespace', 'foo'))
          .result,
      ).toBe('bar');
    });
  });

  describe('TransactionController', () => {
    it('is wired and exposes its state on the wallet messenger', async () => {
      const wallet = await setupWallet();

      expect(
        wallet.messenger.call('TransactionController:getState'),
      ).toStrictEqual(expect.objectContaining({ transactions: [] }));
    });
  });

  describe('RemoteFeatureFlagController', () => {
    it('is wired and exposes its state on the wallet messenger', async () => {
      const wallet = await setupWallet();
      const { messenger } = wallet;

      expect(
        messenger.call('RemoteFeatureFlagController:getState'),
      ).toStrictEqual({
        remoteFeatureFlags: {},
        localOverrides: {},
        rawRemoteFeatureFlags: {},
        cacheTimestamp: 0,
      });
    });

    it('routes injected instanceOptions through to the controller', async () => {
      const wallet = new Wallet({
        instanceOptions: {
          connectivityController: {
            connectivityAdapter: new AlwaysOnlineAdapter(),
          },
          gasFeeController: {
            clientId: 'test',
          },
          networkController: {
            analyticsOptions: {
              isRpcEndpointUrlPublic: (): boolean => false,
              rpcServiceEventsSampleRate: 0,
            },
            infuraProjectId: 'fake-infura-project-id',
          },
          keyringController: { encryptor: new MockEncryptor() },
          storageService: { storage: new InMemoryStorageAdapter() },
          remoteFeatureFlagController: {
            clientConfigApiService: {
              fetchRemoteFeatureFlags: async (): Promise<{
                remoteFeatureFlags: Record<string, boolean>;
                cacheTimestamp: number;
              }> => ({
                remoteFeatureFlags: { testFlag: true },
                cacheTimestamp: Date.now(),
              }),
            },
          },
        },
      });
      const { messenger } = wallet;

      await messenger.call(
        'RemoteFeatureFlagController:updateRemoteFeatureFlags',
      );

      expect(
        messenger.call('RemoteFeatureFlagController:getState')
          .remoteFeatureFlags,
      ).toStrictEqual({ testFlag: true });
    });
  });
});
