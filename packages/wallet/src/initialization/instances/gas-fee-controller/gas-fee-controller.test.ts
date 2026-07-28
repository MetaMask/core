import { GasFeeController } from '@metamask/gas-fee-controller';
import { Messenger } from '@metamask/messenger';
import { InMemoryStorageAdapter } from '@metamask/storage-service';

import type { WalletOptions } from '../../../types.js';
import { Wallet } from '../../../Wallet.js';
import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { AlwaysOnlineAdapter } from '../connectivity-controller/always-online-adapter.js';
import { gasFeeController } from './gas-fee-controller.js';

const controllers: GasFeeController[] = [];
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

describe('gasFeeController', () => {
  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.destroy();
    }

    await Promise.all(wallets.splice(0).map((wallet) => wallet.destroy()));
  });

  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(gasFeeController);
  });

  it('initializes a GasFeeController with default state', () => {
    const rootMessenger = getRootMessenger();
    const messenger = gasFeeController.getMessenger(rootMessenger);

    const instance = gasFeeController.init({
      state: undefined,
      messenger,
      options: { clientId: 'test' },
    });
    controllers.push(instance);

    expect(instance).toBeInstanceOf(GasFeeController);
    expect(rootMessenger.call('GasFeeController:getState')).toStrictEqual({
      gasFeeEstimatesByChainId: {},
      gasFeeEstimates: {},
      estimatedGasFeeTimeBounds: {},
      gasEstimateType: 'none',
      nonRPCGasFeeApisDisabled: false,
    });
  });

  it('is initialized by the default Wallet configuration', () => {
    const wallet = new Wallet({
      instanceOptions: getInstanceOptions(),
    });
    wallets.push(wallet);

    expect(wallet.getInstance('GasFeeController')).toBeInstanceOf(
      GasFeeController,
    );
  });

  it('exposes GasFeeController:fetchGasFeeEstimates over the shared bus, resolving the TransactionController delegation', async () => {
    // The messenger binds the method at construction, so spy on the prototype
    // before building the wallet. This also avoids the real network fetch.
    const fetchGasFeeEstimates = jest
      .spyOn(GasFeeController.prototype, 'fetchGasFeeEstimates')
      .mockResolvedValue({
        gasFeeEstimatesByChainId: {},
        gasFeeEstimates: {},
        estimatedGasFeeTimeBounds: {},
        gasEstimateType: 'none',
        nonRPCGasFeeApisDisabled: false,
      });

    const wallet = new Wallet({
      instanceOptions: getInstanceOptions(),
    });
    wallets.push(wallet);

    await wallet.messenger.call('GasFeeController:fetchGasFeeEstimates');

    expect(fetchGasFeeEstimates).toHaveBeenCalled();
  });

  it('forwards the provided state to the controller', () => {
    const rootMessenger = getRootMessenger();
    const messenger = gasFeeController.getMessenger(rootMessenger);

    const instance = gasFeeController.init({
      state: {
        gasFeeEstimatesByChainId: {},
        gasFeeEstimates: {},
        estimatedGasFeeTimeBounds: {},
        gasEstimateType: 'none',
        nonRPCGasFeeApisDisabled: true,
      },
      messenger,
      options: { clientId: 'test' },
    });
    controllers.push(instance);

    expect(instance.state.nonRPCGasFeeApisDisabled).toBe(true);
  });

  it('builds the network callbacks from the wired NetworkController', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = gasFeeController.getMessenger(rootMessenger);

    const instance = gasFeeController.init({
      state: undefined,
      messenger,
      options: { clientId: 'test' },
    });
    controllers.push(instance);

    // Drives `getProvider` and the EIP-1559/legacy/account callbacks; the
    // estimate then fails at the offline provider, which is irrelevant here.
    await expect(instance.fetchGasFeeEstimates()).rejects.toThrow(
      'Gas fee/price estimation failed',
    );
  });

  it('applies injectable options over the defaults', () => {
    const rootMessenger = getRootMessenger();
    const messenger = gasFeeController.getMessenger(rootMessenger);
    const getCurrentAccountEIP1559Compatibility = jest
      .fn()
      .mockReturnValue(false);
    const getCurrentNetworkLegacyGasAPICompatibility = jest
      .fn()
      .mockReturnValue(true);

    const instance = gasFeeController.init({
      state: undefined,
      messenger,
      options: {
        EIP1559APIEndpoint: 'https://example.test/<chain_id>/eip1559',
        legacyAPIEndpoint: 'https://example.test/<chain_id>/legacy',
        clientId: 'test-client',
        interval: 30_000,
        getCurrentAccountEIP1559Compatibility,
        getCurrentNetworkLegacyGasAPICompatibility,
      },
    });
    controllers.push(instance);

    expect(instance).toBeInstanceOf(GasFeeController);
  });
});

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  const rootMessenger = new Messenger<'Root', DefaultActions, DefaultEvents>({
    namespace: 'Root',
  });

  registerActionHandler(
    rootMessenger,
    'NetworkController',
    'NetworkController:getState',
    jest.fn().mockReturnValue({ selectedNetworkClientId: 'mainnet' }),
  );

  registerActionHandler(
    rootMessenger,
    'NetworkController',
    'NetworkController:getNetworkClientById',
    jest.fn().mockReturnValue({
      // Errors immediately so `eth_gasPrice` fallback settles without a network
      // call rather than hanging.
      provider: {
        sendAsync: (_request: unknown, callback: (error: Error) => void) =>
          callback(new Error('offline')),
      },
      configuration: { chainId: '0x1' },
    }),
  );

  registerActionHandler(
    rootMessenger,
    'NetworkController',
    'NetworkController:getEIP1559Compatibility',
    // `false` skips the EIP-1559/legacy API fetches, so a fetch goes straight to
    // the offline provider above.
    jest.fn().mockResolvedValue(false),
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
