import { Env } from '@metamask/claims-controller';
import { Messenger } from '@metamask/messenger';
import { InMemoryStorageAdapter } from '@metamask/storage-service';
import { TransactionController } from '@metamask/transaction-controller';

import type { WalletOptions } from '../../../types.js';
import { Wallet } from '../../../Wallet.js';
import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { AlwaysOnlineAdapter } from '../connectivity-controller/always-online-adapter.js';
import { transactionController } from './transaction-controller.js';

const controllers: TransactionController[] = [];
const wallets: Wallet[] = [];

const REMOTE_FEATURE_FLAG_OPTIONS = {
  clientConfigApiService: {
    fetchRemoteFeatureFlags: async (): Promise<{
      remoteFeatureFlags: Record<string, boolean>;
      cacheTimestamp: number;
    }> => ({ remoteFeatureFlags: {}, cacheTimestamp: Date.now() }),
  },
};

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

describe('transactionController', () => {
  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.destroy();
    }

    await Promise.all(wallets.splice(0).map((wallet) => wallet.destroy()));
  });

  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      transactionController,
    );
  });

  it('initializes a TransactionController with default state', () => {
    const rootMessenger = getRootMessenger();
    const messenger = transactionController.getMessenger(rootMessenger);

    const instance = transactionController.init({
      state: undefined,
      messenger,
      options: {},
    });
    controllers.push(instance);

    expect(instance).toBeInstanceOf(TransactionController);
    expect(rootMessenger.call('TransactionController:getState')).toStrictEqual({
      methodData: {},
      transactions: [],
      transactionBatches: [],
      lastFetchedBlockNumbers: {},
      submitHistory: [],
    });
  });

  it('is initialized by the default Wallet configuration', () => {
    const wallet = new Wallet({
      instanceOptions: getInstanceOptions(),
    });
    wallets.push(wallet);

    expect(wallet.getInstance('TransactionController')).toBeInstanceOf(
      TransactionController,
    );
  });

  it('forwards the provided state to the controller', () => {
    const rootMessenger = getRootMessenger();
    const messenger = transactionController.getMessenger(rootMessenger);

    const instance = transactionController.init({
      state: {
        lastFetchedBlockNumbers: { '0x1': 123 },
      },
      messenger,
      options: {},
    });
    controllers.push(instance);

    expect(instance.state.lastFetchedBlockNumbers).toStrictEqual({
      '0x1': 123,
    });
  });
});

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  const rootMessenger = new Messenger<'Root', DefaultActions, DefaultEvents>({
    namespace: 'Root',
  });

  registerActionHandler(
    rootMessenger,
    'NetworkController',
    'NetworkController:getNetworkClientRegistry',
    jest.fn().mockReturnValue({}),
  );

  return rootMessenger;
}

function getInstanceOptions(): WalletOptions['instanceOptions'] {
  return {
    connectivityController: {
      connectivityAdapter: new AlwaysOnlineAdapter(),
    },
    gasFeeController: {
      clientId: 'test',
    },
    networkController: {
      infuraProjectId: 'test-infura-project-id',
    },
    storageService: {
      storage: new InMemoryStorageAdapter(),
    },
    remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
    claimsService: {
      env: Env.DEV,
      fetchFunction: globalThis.fetch,
    },
  };
}

function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  namespace: string,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace,
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}
